import pathlib
from dotenv import load_dotenv
import os

# >>> RELOADED main.py: Starting initialization...

# Load .env from the same directory as this file
env_path = pathlib.Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import json
import uvicorn
import os
from langchain_core.messages import HumanMessage, AIMessage
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload # Import selectinload
from contextlib import asynccontextmanager
from datetime import datetime
import uuid

from agents.graph import commander_graph
from agents.experts import EXPERT_FUNCTIONS
from models import (
    Conversation, Message, User, TaskSession, SubTask,
    CustomAgent, CustomAgentCreate, CustomAgentUpdate, CustomAgentResponse
)
from database import create_db_and_tables, get_session
from config import init_langchain_tracing, validate_config
from utils.exceptions import (
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    LLMError,
    DatabaseError,
    ExternalServiceError,
    RateLimitError,
    handle_error
)


# ============================================================================
# 共享的大模型调用函数
# ============================================================================

async def stream_llm_response(
    messages: list,
    system_prompt: str,
    model: str = None,
    conversation_id: str = None
) -> AsyncGenerator[str, None]:
    """
    共享的大模型流式响应函数

    Args:
        messages: 消息列表（LangChain 格式）
        system_prompt: 系统提示词
        model: 模型名称（可选，默认从环境变量读取）
        conversation_id: 会话 ID（可选）

    Yields:
        SSE 格式的数据块
    """
    from langchain_openai import ChatOpenAI

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    model_name = model or os.getenv("MODEL_NAME", "deepseek-chat")

    print(f"[LLM] 初始化模型: {model_name}")
    print(f"[LLM] Base URL: {base_url}")

    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.7,
        streaming=True
    )

    # 添加 System Prompt
    messages_with_system = []
    messages_with_system.append(("system", system_prompt))
    messages_with_system.extend(messages)

    print(f"[LLM] 开始流式生成...")
    chunk_count = 0

    async for chunk in llm.astream(messages_with_system):
        content = chunk.content
        if content:
            chunk_count += 1
            print(f"[LLM] Chunk #{chunk_count}: {repr(content[:50] if len(content) > 50 else content)}")

            # SSE 格式：data: {...}\n\n
            event_data = {'content': content}
            if conversation_id:
                event_data['conversationId'] = conversation_id
            yield f"data: {json.dumps(event_data)}\n\n"

    print(f"[LLM] 完成，总 chunk 数: {chunk_count}")


async def invoke_llm_response(
    messages: list,
    system_prompt: str,
    model: str = None
) -> str:
    """
    共享的大模型非流式响应函数

    Args:
        messages: 消息列表（LangChain 格式）
        system_prompt: 系统提示词
        model: 模型名称（可选，默认从环境变量读取）

    Returns:
        完整的响应文本
    """
    from langchain_openai import ChatOpenAI

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    model_name = model or os.getenv("MODEL_NAME", "deepseek-chat")

    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.7
    )

    # 添加 System Prompt
    messages_with_system = []
    messages_with_system.append(("system", system_prompt))
    messages_with_system.extend(messages)

    result = await llm.ainvoke(messages_with_system)
    return result.content



@asynccontextmanager
async def lifespan(app: FastAPI):
    # 初始化 LangSmith 追踪
    init_langchain_tracing()
    # 验证配置
    validate_config()
    # 创建数据库表
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

# 添加请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    print(f"[MIDDLEWARE] 收到请求: {request.method} {request.url.path}")
    print(f"[MIDDLEWARE] Headers: {dict(request.headers)}")
    response = await call_next(request)
    return response

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """处理自定义应用异常"""
    print(f"[APP ERROR] {exc.code}: {exc.message}")
    if exc.original_error:
        import traceback
        traceback.print_exception(type(exc.original_error), exc.original_error, exc.original_error.__traceback__)
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict(),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """处理 FastAPI HTTP 异常"""
    print(f"[HTTP ERROR] {exc.status_code}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "HTTP_ERROR",
                "message": str(exc.detail),
                "details": {}
            }
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """处理未捕获的异常"""
    import traceback
    print("=" * 80)
    print("[UNHANDLED ERROR] Global exception caught:")
    print(f"[UNHANDLED ERROR] Request path: {request.url.path}")
    print(f"[UNHANDLED ERROR] Exception type: {type(exc).__name__}")
    print(f"[UNHANDLED ERROR] Exception message: {str(exc)}")
    print("[UNHANDLED ERROR] Stack trace:")
    traceback.print_exc()
    print("=" * 80)
    
    # 转换为 AppError
    app_error = handle_error(exc)
    return JSONResponse(
        status_code=app_error.status_code,
        content=app_error.to_dict(),
    )

# 配置 CORS
def get_cors_origins():
    """从环境变量 CORS_ORIGINS 读取允许的来源，支持逗号分隔的多个域名"""
    cors_origins_str = os.getenv("CORS_ORIGINS", "").strip()
    if cors_origins_str:
        # 按逗号分割，去除空白字符
        origins = [origin.strip() for origin in cors_origins_str.split(",")]
        print(f"[CORS] 允许的来源: {origins}")
        return origins
    
    # 未设置 CORS_ORIGINS，根据环境变量决定默认值
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        print("[WARN] 生产环境未设置 CORS_ORIGINS，CORS 将拒绝所有跨域请求")
        return []
    else:
        # 开发环境默认允许本地前端
        default_origin = "http://localhost:5173"
        print(f"[CORS] 开发环境默认允许来源: {default_origin}")
        return [default_origin]

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-User-ID", "X-Request-ID"],
)

# 添加安全头信息中间件
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # 安全头信息
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # 基本 CSP - 允许自身和 inline 样式/脚本（开发环境）
    csp_policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    response.headers["Content-Security-Policy"] = csp_policy
    # 权限策略
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

class ChatMessageDTO(BaseModel):
    role: str
    content: str
    id: Optional[str] = None
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessageDTO]
    conversationId: Optional[str] = None
    agentId: Optional[str] = "assistant"
    stream: Optional[bool] = True


class ChatInvokeRequest(BaseModel):
    """双模路由请求模型"""
    message: str
    mode: str = "auto"  # "auto" 或 "direct"
    agent_id: Optional[str] = None  # direct 模式下必填
    thread_id: Optional[str] = None  # LangSmith 线程 ID

class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    avatar: Optional[str] = None
    plan: Optional[str] = None

# --- Dependency: Current User ---
async def get_current_user(request: Request, session: Session = Depends(get_session)) -> User:
    user_id = request.headers.get("X-User-ID")
    if not user_id:
        # Fallback for dev/testing without header
        user_id = "default-user"
    
    user = session.get(User, user_id)
    if not user:
        # Auto-register new user
        user = User(id=user_id, username=f"User-{user_id[:4]}")
        session.add(user)
        session.commit()
        session.refresh(user)
    
    return user

# --- API Endpoints ---

@app.get("/")
async def root():
    return {"status": "ok", "message": "XPouch AI Backend (Python + SQLModel) is running"}

# 用户信息接口
@app.get("/api/user/me")
async def get_user_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.put("/api/user/me")
async def update_user_me(request: UpdateUserRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if request.username is not None:
        current_user.username = request.username
    if request.avatar is not None:
        current_user.avatar = request.avatar
    if request.plan is not None:
        current_user.plan = request.plan
        
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


# ============================================================================
# 自定义智能体 API（简单对话模式）
# ============================================================================

@app.post("/api/agents")
async def create_custom_agent(
    agent_data: CustomAgentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    创建自定义智能体
    
    用户创建的智能体用于简单的对话场景，直接使用自定义的 system_prompt
    调用 LLM，不经过 LangGraph 专家工作流。
    """
    custom_agent = CustomAgent(
        user_id=current_user.id,
        name=agent_data.name,
        description=agent_data.description,
        system_prompt=agent_data.system_prompt,
        category=agent_data.category,
        model_id=agent_data.model_id
    )
    session.add(custom_agent)
    session.commit()
    session.refresh(custom_agent)
    print(f"[API] 创建自定义智能体: {custom_agent.id} - {custom_agent.name}")
    return custom_agent


@app.get("/api/agents")
async def get_all_agents(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    获取当前用户的所有自定义智能体

    注意：
    - 系统专家（sys-search, sys-coder等）由前端常量管理，不通过API返回
    - 此端点仅返回用户创建的自定义智能体
    """
    try:
        print(f"[API] /api/agents called, user_id: {current_user.id}")

        # 用户自定义智能体（按创建时间降序，最新的在前）
        statement = select(CustomAgent).where(CustomAgent.user_id == current_user.id).order_by(CustomAgent.created_at.desc())
        print(f"[API] Query statement created")

        custom_agents = session.exec(statement).all()
        print(f"[API] Query executed, found {len(custom_agents)} agents")

        # 构建返回结果，确保所有字段可序列化
        result = []
        for agent in custom_agents:
            print(f"[API] Processing agent: {agent.id} - {agent.name}")
            agent_data = {
                "id": str(agent.id),
                "name": agent.name,
                "description": agent.description or "",
                "system_prompt": agent.system_prompt,
                "category": agent.category,
                "model_id": agent.model_id,
                "conversation_count": agent.conversation_count,
                "is_public": agent.is_public,
                "created_at": agent.created_at.isoformat() if agent.created_at else None,
                "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
                "is_builtin": False
            }
            result.append(agent_data)

        print(f"[API] Returning custom agents: {len(result)} items")
        return result

    except Exception as e:
        print(f"[API] Error in /api/agents: {e}")
        import traceback
        traceback.print_exc()
        raise AppError(message=str(e), original_error=e)


@app.get("/api/agents/{agent_id}")
async def get_custom_agent(
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取单个自定义智能体详情"""
    agent = session.get(CustomAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise NotFoundError(resource="智能体")
    return agent


@app.delete("/api/agents/{agent_id}")
async def delete_custom_agent(
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """删除自定义智能体"""
    agent = session.get(CustomAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise NotFoundError(resource="智能体")
    session.delete(agent)
    session.commit()
    print(f"[API] 删除自定义智能体: {agent_id}")
    return {"ok": True}


@app.put("/api/agents/{agent_id}")
async def update_custom_agent(
    agent_id: str,
    agent_data: CustomAgentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """更新自定义智能体"""
    agent = session.get(CustomAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise NotFoundError(resource="智能体")
    
    if agent_data.name is not None:
        agent.name = agent_data.name
    if agent_data.description is not None:
        agent.description = agent_data.description
    if agent_data.system_prompt is not None:
        agent.system_prompt = agent_data.system_prompt
    if agent_data.category is not None:
        agent.category = agent_data.category
    if agent_data.model_id is not None:
        agent.model_id = agent_data.model_id
    
    agent.updated_at = datetime.now()
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


# 获取所有会话列表 (Filtered by User)
@app.get("/api/conversations")
async def get_conversations(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    statement = select(Conversation).where(Conversation.user_id == current_user.id).order_by(Conversation.updated_at.desc())
    conversations = session.exec(statement).all()
    return conversations

# 获取单个会话详情 (Filtered by User)
@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    statement = select(Conversation).where(Conversation.id == conversation_id).options(selectinload(Conversation.messages))
    conversation = session.exec(statement).first()

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError(resource="会话")
    return conversation

# 删除会话 (Filtered by User)
@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    conversation = session.get(Conversation, conversation_id)
    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError(resource="会话")
    session.delete(conversation)
    session.commit()
    return {"ok": True}

# 聊天接口
# ============================================================================
# 简单对话端点（sys-assistant）
# ============================================================================

ASSISTANT_SYSTEM_PROMPT = """你是一个通用的 AI 助手，专门用于日常对话和回答用户的各种问题。

你的职责：
- 友好、耐心地回答用户的问题
- 提供准确、有用的信息
- 在不确定时坦诚告知
- 保持对话的自然流畅

请用清晰、友好的语言回答用户的问题。"""


@app.post("/api/chat-simple")
async def chat_simple_endpoint(
    request: ChatRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    简单对话端点（sys-assistant 模式）

    功能：
    - 直连大模型，不经过 LangGraph
    - 不维护专家状态
    - 快速响应
    """
    print(f"[SIMPLE] ========== 简单对话请求 ==========")
    print(f"[SIMPLE] Message content: {request.message}")
    print(f"[SIMPLE] User ID: {current_user.id}")

    # 1. 确定 Conversation ID
    conversation_id = request.conversationId
    conversation = None

    if conversation_id:
        conversation = session.get(Conversation, conversation_id)
        if conversation and conversation.user_id != current_user.id:
            raise AuthorizationError("没有权限访问此会话")

    if not conversation:
        # 创建新会话
        conversation_id = str(uuid.uuid4())
        conversation = Conversation(
            id=conversation_id,
            title=request.message[:30] + "..." if len(request.message) > 30 else request.message,
            agent_id="sys-assistant",
            user_id=current_user.id,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        session.add(conversation)
        session.commit()
        session.refresh(conversation)

    # 2. 保存用户消息到数据库
    user_msg_db = Message(
        conversation_id=conversation_id,
        role="user",
        content=request.message,
        timestamp=datetime.now()
    )
    session.add(user_msg_db)
    session.commit()

    # 3. 准备消息历史
    statement = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.timestamp)
    db_messages = session.exec(statement).all()

    langchain_messages = []
    for msg in db_messages:
        if msg.role == "user":
            langchain_messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            langchain_messages.append(AIMessage(content=msg.content))

    # 4. 流式响应
    if request.stream:
        async def event_generator():
            full_response = ""
            try:
                print(f"[SIMPLE] 开始流式生成...")

                async for chunk in stream_llm_response(
                    langchain_messages,
                    ASSISTANT_SYSTEM_PROMPT,
                    conversation_id=conversation_id
                ):
                    yield chunk
                    content = json.loads(chunk.split("data: ")[1].strip())
                    full_response += content.get('content', '')

                print(f"[SIMPLE] 完成，总长度: {len(full_response)}")

                # 保存 AI 回复到数据库
                if full_response:
                    ai_msg_db = Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=full_response,
                        timestamp=datetime.now()
                    )
                    from database import engine
                    with Session(engine) as inner_session:
                        inner_session.add(ai_msg_db)
                        # 更新会话时间
                        conv = inner_session.get(Conversation, conversation_id)
                        if conv:
                            conv.updated_at = datetime.now()
                            inner_session.add(conv)
                        inner_session.commit()

                yield "data: [DONE]\n\n"

            except Exception as e:
                print(f"[SIMPLE] 错误: {e}")
                import traceback
                traceback.print_exc()
                error_msg = json.dumps({"error": str(e)})
                yield f"data: {error_msg}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    else:
        # 非流式响应
        full_response = await invoke_llm_response(
            langchain_messages,
            ASSISTANT_SYSTEM_PROMPT
        )

        # 保存 AI 回复
        ai_msg_db = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=full_response,
            timestamp=datetime.now()
        )
        session.add(ai_msg_db)
        conversation.updated_at = datetime.now()
        session.add(conversation)
        session.commit()

        return {
            "role": "assistant",
            "content": full_response,
            "conversationId": conversation_id
        }


# ============================================================================
# 复杂任务端点（sys-commander）
# ============================================================================

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    print(f"[MAIN] ========== Received chat request ==========")
    print(f"[MAIN] Message content: {request.message}")
    print(f"[MAIN] Agent ID: {request.agentId}")
    print(f"[MAIN] Conversation ID: {request.conversationId}")
    print(f"[MAIN] Stream: {request.stream}")
    print(f"[MAIN] User ID: {current_user.id}")

    # 1. 确定 Conversation ID
    conversation_id = request.conversationId
    conversation = None
    
    if conversation_id:
        conversation = session.get(Conversation, conversation_id)
        if conversation and conversation.user_id != current_user.id:
             raise AuthorizationError("没有权限访问此会话")
        
    if not conversation:
        # 如果没有ID或找不到，创建新会话
        conversation_id = str(uuid.uuid4())
        conversation = Conversation(
            id=conversation_id,
            title=request.message[:30] + "..." if len(request.message) > 30 else request.message,
            agent_id=request.agentId,
            user_id=current_user.id, # 绑定当前用户
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        session.add(conversation)
        session.commit()
        session.refresh(conversation)

    # 2. 保存用户消息到数据库
    user_msg_db = Message(
        conversation_id=conversation_id,
        role="user",
        content=request.message,
        timestamp=datetime.now()
    )
    session.add(user_msg_db)
    session.commit()

    # 3. 准备 LangGraph 上下文
    statement = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.timestamp)
    db_messages = session.exec(statement).all()
    
    langchain_messages = []
    for msg in db_messages:
        if msg.role == "user":
            langchain_messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            langchain_messages.append(AIMessage(content=msg.content))
            
    # 构建状态

    # 检查是否是自定义智能体
    expert_types = ["search", "coder", "researcher", "analyzer", "writer", "planner", "image_analyzer"]
    custom_agent = None

    # 处理 sys- 前缀（系统专家智能体）
    agent_id_for_check = request.agentId
    if agent_id_for_check and agent_id_for_check.startswith("sys-"):
        agent_id_for_check = agent_id_for_check[4:]  # 去掉 sys- 前缀

    print(f"[COMPLEX] Expert types list: {expert_types}")
    print(f"[MAIN] Checking: {request.agentId} -> {agent_id_for_check} in expert types: {agent_id_for_check in expert_types}")

    # 特殊处理：sys-commander 直接进入指挥官模式（不走自定义 agent 逻辑）
    is_commander_mode = request.agentId == "sys-commander" or agent_id_for_check == "commander"
    if is_commander_mode:
        print(f"[MAIN] [COMMANDER MODE] Detected sys-commander, entering commander workflow")
        agent_id_for_check = "commander"  # 强制设置为 commander
        custom_agent = None  # 不走自定义 agent 逻辑
    elif agent_id_for_check not in expert_types:
        # 可能是自定义智能体，从数据库加载
        print(f"[MAIN] Checking custom agent: {request.agentId}")
        custom_agent = session.get(CustomAgent, request.agentId)
        print(f"[MAIN] Query result: Agent found={custom_agent is not None}")

        if custom_agent and custom_agent.user_id == current_user.id:
            # 不打印 name 和 system_prompt 避免编码问题
            print(f"[MAIN] [OK] Custom agent detected")
            print(f"[MAIN] [OK] System prompt length: {len(custom_agent.system_prompt)}")
            # 更新使用次数
            custom_agent.conversation_count += 1
            session.add(custom_agent)
            session.commit()
        else:
            print(f"[MAIN] [NOT FOUND] Custom agent not found, using commander mode")
            if custom_agent:
                print(f"[MAIN] [ERROR] User ID mismatch")
            else:
                print(f"[MAIN] [ERROR] Custom agent does not exist")
            custom_agent = None
    else:
        custom_agent = None
    
    # 如果是自定义智能体，使用直接 LLM 调用模式（不经过 LangGraph）
    if custom_agent:
        print(f"[MAIN] 自定义智能体模式: {custom_agent.name}")
        print(f"[MAIN] System Prompt: {custom_agent.system_prompt[:50]}...")
        
        # 4. 流式响应处理（自定义智能体直接调用 LLM）
        if request.stream:
            async def event_generator():
                full_response = ""
                try:
                    # 导入 LLM
                    from langchain_openai import ChatOpenAI
                    import os
                    
                    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
                    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
                    model_name = custom_agent.model_id or os.getenv("MODEL_NAME", "deepseek-chat")
                    
                    print(f"[CUSTOM AGENT] 使用模型: {model_name}")
                    print(f"[CUSTOM AGENT] 使用 Base URL: {base_url}")
                    
                    llm = ChatOpenAI(
                        model=model_name,
                        api_key=api_key,
                        base_url=base_url,
                        temperature=0.7,
                        streaming=True
                    )
                    
                    # 添加 System Prompt
                    messages_with_system = []
                    messages_with_system.append(("system", custom_agent.system_prompt))
                    messages_with_system.extend(langchain_messages)
                    
                    print(f"[CUSTOM AGENT] 开始流式生成...")
                    async for chunk in llm.astream(messages_with_system):
                        content = chunk.content
                        if content:
                            full_response += content
                            yield f"data: {json.dumps({'content': content, 'conversationId': conversation_id})}\n\n"
                    
                    print(f"[CUSTOM AGENT] 完成，总长度: {len(full_response)}")
                    
                except Exception as e:
                    print(f"[CUSTOM AGENT] 错误: {e}")
                    import traceback
                    traceback.print_exc()
                    error_msg = json.dumps({"error": str(e)})
                    yield f"data: {error_msg}\n\n"
                
                # 5. 保存 AI 回复到数据库
                if full_response:
                    ai_msg_db = Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=full_response,
                        timestamp=datetime.now()
                    )
                    from database import engine
                    with Session(engine) as inner_session:
                        inner_session.add(ai_msg_db)
                        # 更新会话时间
                        conv = inner_session.get(Conversation, conversation_id)
                        if conv:
                            conv.updated_at = datetime.now()
                            inner_session.add(conv)
                        inner_session.commit()
                
                yield "data: [DONE]\n\n"
            
            return StreamingResponse(
                event_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        else:
            # 非流式
            from langchain_openai import ChatOpenAI
            import os
            
            api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
            base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
            model_name = custom_agent.model_id or os.getenv("MODEL_NAME", "deepseek-chat")
            
            llm = ChatOpenAI(
                model=model_name,
                api_key=api_key,
                base_url=base_url,
                temperature=0.7
            )
            
            # 添加 System Prompt
            messages_with_system = []
            messages_with_system.append(("system", custom_agent.system_prompt))
            messages_with_system.extend(langchain_messages)
            
            result = await llm.ainvoke(messages_with_system)
            full_response = result.content
            
            # 保存 AI 回复
            ai_msg_db = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=full_response,
                timestamp=datetime.now()
            )
            session.add(ai_msg_db)
            conversation.updated_at = datetime.now()
            session.add(conversation)
            session.commit()
            
            return {
                "role": "assistant",
                "content": full_response,
                "conversationId": conversation_id
            }
    
    # 预定义专家模式
    print(f"[MAIN] 检查 agentId: {request.agentId} -> {agent_id_for_check}, expert_types: {expert_types}")
    if agent_id_for_check in expert_types:
        print(f"[MAIN] 检测到直接专家模式: {agent_id_for_check}")
        # 直接创建单个任务列表
        task_list = [{
            "id": str(uuid.uuid4()),
            "expert_type": agent_id_for_check,
            "description": request.message,
            "input_data": {},
            "priority": 0,
            "status": "pending",
            "output_result": None,
            "started_at": None,
            "completed_at": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }]
        print(f"[MAIN] 创建任务列表: {len(task_list)} 个任务")
        print(f"[MAIN] 任务详情: {task_list[0]['description']}")

        initial_state = {
            "messages": langchain_messages,
            "current_agent": agent_id_for_check,
            "task_list": task_list,
            "current_task_index": 0,
            "strategy": f"直接专家模式 - {agent_id_for_check}",
            "expert_results": [],
            "final_response": ""
        }
        print(f"[MAIN] initial_state task_list 长度: {len(initial_state['task_list'])}")
    else:
        # 指挥官模式：通过 LLM 拆解任务
        print(f"[MAIN] 进入指挥官模式，agentId: {request.agentId}")
        initial_state = {
            "messages": langchain_messages,
            "current_agent": "commander",  # 指挥官模式下使用 commander 作为 current_agent
            "task_list": [],
            "current_task_index": 0,
            "strategy": "",
            "expert_results": [],
            "final_response": "",
            "context": {}
        }
        print(f"[MAIN] initial_state: {initial_state}")

    # 4. 流式响应处理
    if request.stream:
        async def event_generator():
            full_response = ""
            event_count = 0

            # 为每个专家维护 artifact 列表（支持多个 artifact 累积）
            expert_artifacts = {}

            try:
                print(f"[STREAM] 开始流式处理...")
                async for event in commander_graph.astream_events(
                    initial_state,
                    version="v2"
                ):
                    event_count += 1
                    kind = event["event"]
                    name = event.get("name", "")

                    # 每收到10个事件打印一次进度（调试用）
                    if event_count % 10 == 0:
                        print(f"[STREAM] 已处理 {event_count} 个事件，当前: {kind} - {name}")

                    # 捕获指挥官节点执行
                    if kind == "on_chain_start" and name == "commander":
                        print(f"[STREAM] 指挥官节点开始执行")

                    # 捕获指挥官节点执行结束（获取任务计划）
                    if kind == "on_chain_end" and name == "commander":
                        print(f"[STREAM] 指挥官节点结束，检查是否有任务计划...")
                        output_data = event["data"]["output"]

                        if "__task_plan" in output_data:
                            task_plan = output_data["__task_plan"]
                            print(f"[STREAM] 发现任务计划: {task_plan['task_count']} 个任务")
                            # 推送任务计划事件到前端
                            yield f"data: {json.dumps({'taskPlan': task_plan, 'conversationId': conversation_id})}\n\n"
                            print(f"[STREAM] 推送任务计划事件")

                    # 捕获聚合器节点执行结束（获取最终响应）
                    if kind == "on_chain_end" and name == "aggregator":
                        print(f"[STREAM] 聚合器节点结束，检查是否有最终响应...")
                        output_data = event["data"]["output"]

                        if "final_response" in output_data:
                            final_response = output_data["final_response"]
                            print(f"[STREAM] 发现最终响应，长度: {len(final_response)}")
                            # 推送最终响应到前端
                            yield f"data: {json.dumps({'content': final_response, 'conversationId': conversation_id, 'isFinal': True})}\n\n"
                            print(f"[STREAM] 推送最终响应事件")

                    # 捕获专家分发器节点开始执行（推送任务开始信息）
                    if kind == "on_chain_start" and name == "expert_dispatcher":
                        print(f"[STREAM] expert_dispatcher 节点开始执行，检查是否有任务信息...")
                        # 从事件输入中获取 state
                        input_data = event.get("data", {}).get("input", {})
                        task_list = input_data.get("task_list", [])
                        current_task_index = input_data.get("current_task_index", 0)

                        if task_list and current_task_index < len(task_list):
                            current_task = task_list[current_task_index]
                            task_start_info = {
                                "task_index": current_task_index + 1,
                                "total_tasks": len(task_list),
                                "expert_type": current_task.get("expert_type", ""),
                                "description": current_task.get("description", "")
                            }
                            print(f"[STREAM] 推送任务开始信息: {task_start_info}")
                            yield f"data: {json.dumps({'taskStart': task_start_info, 'conversationId': conversation_id})}\n\n"

                    # 捕获专家分发器节点执行（通过 __expert_info 字段传递专家信息）
                    if kind == "on_chain_end" and name == "expert_dispatcher":
                        print(f"[STREAM] expert_dispatcher 节点结束，检查是否有专家信息...")
                        output_data = event["data"]["output"]
                        print(f"[STREAM] output_data 类型: {type(output_data)}")

                        # 移除重复的 __task_start_info 处理（现在在 on_chain_start 时处理）
                        if "__expert_info" in output_data:
                            expert_info = output_data["__expert_info"]
                            expert_name = expert_info.get("expert_type")
                            expert_status = expert_info.get("status", "completed")
                            duration_ms = expert_info.get("duration_ms", 0)
                            output_result = expert_info.get("output", "")
                            expert_error = expert_info.get("error")

                            print(f"[STREAM] 发现专家信息: {expert_name}, 状态: {expert_status}, 耗时: {duration_ms}ms")

                            # 初始化该专家的 artifact 列表
                            if expert_name not in expert_artifacts:
                                expert_artifacts[expert_name] = []

                            # 推送专家激活事件（在专家开始执行时）
                            yield f"data: {json.dumps({'activeExpert': expert_name, 'conversationId': conversation_id})}\n\n"
                            print(f"[STREAM] 推送专家激活事件: {expert_name}")

                            # 检查是否生成了 artifact
                            if "artifact" in output_data:
                                artifact = output_data["artifact"]
                                print(f"[STREAM] 检测到 artifact: {artifact['type']}")
                                print(f"[STREAM] artifact content 长度: {len(artifact.get('content', ''))}")

                                # 添加到该专家的 artifact 列表
                                expert_artifacts[expert_name].append(artifact)
                                print(f"[STREAM] 专家 {expert_name} 当前 artifacts 数量: {len(expert_artifacts[expert_name])}")

                                # 推送 artifact_update 事件（包含所有 artifacts）
                                yield f"data: {json.dumps({'artifact': artifact, 'conversationId': conversation_id, 'allArtifacts': expert_artifacts[expert_name]})}\n\n"

                            # 推送专家完成事件（包含完整信息）
                            yield f"data: {json.dumps({
                                'expertCompleted': expert_name,
                                'conversationId': conversation_id,
                                'duration_ms': duration_ms,
                                'status': expert_status,
                                'output': output_result,
                                'error': expert_error,
                                'allArtifacts': expert_artifacts.get(expert_name, [])
                            })}\n\n"
                            print(f"[STREAM] 专家 {expert_name} 执行完成")
                        else:
                            print(f"[STREAM] ⚠️  未检测到 __expert_info 字段")

                    # 捕获 LLM 流式输出
                    if kind == "on_chat_model_stream":
                        content = event["data"]["chunk"].content
                        if content:
                            full_response += content
                            yield f"data: {json.dumps({'content': content, 'conversationId': conversation_id})}\n\n"

                print(f"[STREAM] 流式处理完成，共处理 {event_count} 个事件")
                print(f"[STREAM] total_response 长度: {len(full_response)}")

            except Exception as e:
                print(f"[STREAM] 错误: {e}")
                import traceback
                traceback.print_exc()
                error_msg = json.dumps({"error": str(e)})
                yield f"data: {error_msg}\n\n"

            # 5. 流式结束后，保存 AI 回复到数据库
            if full_response:
                ai_msg_db = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                    timestamp=datetime.now()
                )
                from database import engine
                with Session(engine) as inner_session:
                    inner_session.add(ai_msg_db)
                    # 更新会话时间
                    conv = inner_session.get(Conversation, conversation_id)
                    if conv:
                        conv.updated_at = datetime.now()
                        inner_session.add(conv)
                    inner_session.commit()

            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    else:
        # 非流式
        result = await commander_graph.ainvoke(initial_state)
        last_message = result["messages"][-1]
        
        # 保存 AI 回复
        ai_msg_db = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=last_message.content,
            timestamp=datetime.now()
        )
        session.add(ai_msg_db)
        conversation.updated_at = datetime.now()
        session.add(conversation)
        session.commit()
        
        return {
            "role": "assistant",
            "content": last_message.content,
            "conversationId": conversation_id
        }


# ============================================================================
# 双模路由：Auto 模式（完整工作流）vs Direct 模式（单专家执行）
# ============================================================================

@app.post("/api/v1/chat/invoke")
async def chat_invoke_endpoint(
    request: ChatInvokeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    双模路由端点：支持 Auto 和 Direct 两种执行模式

    Auto 模式：完整的多专家协作流程（commander_graph）
    - 指挥官拆解任务
    - 多专家顺序执行
    - 结果聚合

    Direct 模式：直接调用单个专家
    - 跳过指挥官和聚合器
    - 直接执行指定专家
    - 适用于简单任务

    两种模式都会：
    - 保存结果到 TaskSession 数据库
    - 生成 thread_id 用于 LangSmith 追踪
    """
    print(f"[INVOKE] 模式: {request.mode}, Agent: {request.agent_id}")

    # 1. 模式验证
    if request.mode not in ["auto", "direct"]:
        raise ValidationError(f"无效的执行模式: {request.mode}，必须是 'auto' 或 'direct'")

    # 2. Direct 模式需要 agent_id
    if request.mode == "direct" and not request.agent_id:
        raise ValidationError("Direct 模式需要指定 agent_id")

    # 3. 验证 agent_id 是否在 EXPERT_FUNCTIONS 中
    if request.mode == "direct":
        if request.agent_id not in EXPERT_FUNCTIONS:
            raise ValidationError(f"未知的专家类型: {request.agent_id}，可用专家: {list(EXPERT_FUNCTIONS.keys())}")

    # 4. 创建 TaskSession 记录（用于数据库持久化）
    thread_id = request.thread_id or str(uuid.uuid4())
    task_session = TaskSession(
        session_id=thread_id,
        user_query=request.message,
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    session.add(task_session)
    session.commit()
    session.refresh(task_session)

    # 5. 导入 LLM（需要从 agents.graph 重新导入）
    import os
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, AIMessage

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    model_name = os.getenv("MODEL_NAME", "deepseek-chat")

    llm = ChatOpenAI(
        model=model_name,
        temperature=0.7,
        api_key=api_key,
        base_url=base_url,
        streaming=True
    )

    # 6. 根据模式执行
    try:
        if request.mode == "auto":
            # ========================================================
            # Auto 模式：完整的多专家协作流程
            # ========================================================
            print("[AUTO MODE] 启动完整工作流")

            # 构建初始状态
            initial_state = {
                "messages": [HumanMessage(content=request.message)],
                "task_list": [],
                "current_task_index": 0,
                "strategy": "",
                "expert_results": [],
                "final_response": ""
            }

            # 执行指挥官工作流
            final_state = await commander_graph.ainvoke(
                initial_state,
                config={"configurable": {"thread_id": thread_id}}
            )

            # 保存 SubTask 到数据库
            for subtask in final_state["task_list"]:
                # task_list 现在是字典列表，直接使用字典字段
                db_subtask = SubTask(
                    id=subtask["id"],
                    expert_type=subtask["expert_type"],
                    description=subtask["description"],
                    input_data=subtask["input_data"],
                    status=subtask["status"],
                    output_result=subtask["output_result"],
                    started_at=subtask.get("started_at"),
                    completed_at=subtask.get("completed_at"),
                    created_at=subtask["created_at"],
                    updated_at=subtask["updated_at"],
                    task_session_id=task_session.session_id
                )
                session.add(db_subtask)

            # 更新 TaskSession
            task_session.final_response = final_state["final_response"]
            task_session.status = "completed"
            task_session.completed_at = datetime.now()
            task_session.updated_at = datetime.now()

            session.commit()

            print(f"[AUTO MODE] 完成，执行了 {len(final_state['expert_results'])} 个专家")

            return {
                "mode": "auto",
                "thread_id": thread_id,
                "session_id": task_session.session_id,
                "user_query": request.message,
                "strategy": final_state["strategy"],
                "final_response": final_state["final_response"],
                "expert_results": final_state["expert_results"],
                "sub_tasks_count": len(final_state["task_list"]),
                "status": "completed"
            }

        else:
            # ========================================================
            # Direct 模式：直接调用单个专家
            # ========================================================
            print(f"[DIRECT MODE] 直接调用专家: {request.agent_id}")

            # 构建状态（模拟单个任务）
            subtask_dict = {
                "id": str(uuid.uuid4()),
                "expert_type": request.agent_id,
                "description": request.message,
                "input_data": {},
                "status": "pending",
                "created_at": datetime.now(),
                "updated_at": datetime.now()
            }

            initial_state = {
                "messages": [HumanMessage(content=request.message)],
                "task_list": [subtask_dict],
                "current_task_index": 0,
                "strategy": f"直接模式: {request.agent_id} 专家",
                "expert_results": [],
                "final_response": ""
            }

            # 调用原子化专家函数
            expert_func = EXPERT_FUNCTIONS[request.agent_id]
            result = await expert_func(initial_state, llm)

            # 保存 SubTask 到数据库
            db_subtask = SubTask(
                id=subtask_dict["id"],
                expert_type=subtask_dict["expert_type"],
                description=subtask_dict["description"],
                input_data=subtask_dict["input_data"],
                status=result.get("status", "completed"),
                output_result={"content": result.get("output_result", "")},
                started_at=result.get("started_at"),
                completed_at=result.get("completed_at"),
                created_at=subtask_dict["created_at"],
                updated_at=subtask_dict["updated_at"],
                task_session_id=task_session.session_id
            )
            session.add(db_subtask)

            # 构建专家结果
            expert_result = {
                "task_id": subtask_dict["id"],
                "expert_type": request.agent_id,
                "description": request.message,
                "output": result.get("output_result", ""),
                "status": result.get("status", "unknown"),
                "started_at": result.get("started_at"),
                "completed_at": result.get("completed_at"),
                "duration_ms": result.get("duration_ms", 0)
            }

            # 更新 TaskSession
            task_session.final_response = result.get("output_result", "")
            task_session.status = "completed"
            task_session.completed_at = datetime.now()
            task_session.updated_at = datetime.now()

            session.commit()

            print(f"[DIRECT MODE] 完成，专家: {request.agent_id}")

            return {
                "mode": "direct",
                "thread_id": thread_id,
                "session_id": task_session.session_id,
                "user_query": request.message,
                "expert_type": request.agent_id,
                "final_response": result.get("output_result", ""),
                "expert_results": [expert_result],
                "sub_tasks_count": 1,
                "status": "completed"
            }

    except Exception as e:
        # 错误处理：更新 TaskSession 状态
        task_session.status = "failed"
        task_session.final_response = f"执行失败: {str(e)}"
        task_session.updated_at = datetime.now()
        session.commit()

        print(f"[ERROR] 执行失败: {e}")
        raise AppError(message=f"执行失败: {str(e)}", original_error=e)


if __name__ == "__main__":
    # Local dev defaults to 3002, Docker uses PORT env var (e.g. 3000)
    port = int(os.getenv("PORT", 3002))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
