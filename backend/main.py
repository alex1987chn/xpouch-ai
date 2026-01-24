import pathlib
from dotenv import load_dotenv
import os
import sys

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
from types import SimpleNamespace
import json
import uvicorn
import os
from langchain_core.messages import HumanMessage, AIMessage
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload # Import selectinload
from contextlib import asynccontextmanager
from datetime import datetime
import uuid
import io

from agents.graph import commander_graph
from agents.experts import EXPERT_FUNCTIONS
from models import (
    Conversation, Message, User, TaskSession, SubTask,
    CustomAgent, CustomAgentCreate, CustomAgentUpdate, CustomAgentResponse
)
from database import create_db_and_tables, get_session
from config import init_langchain_tracing, validate_config
from constants import (
    ASSISTANT_SYSTEM_PROMPT,
    normalize_agent_id,
    is_system_agent,
    SYSTEM_AGENT_ORCHESTRATOR,
    SYSTEM_AGENT_DEFAULT_CHAT
)
from utils.artifacts import parse_artifacts_from_response, generate_artifact_event
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

    返回列表：
    - 用户自定义智能体（按创建时间降序，最新的在前）

    注意：
    - 系统专家（search, coder, researcher等）不返回，虚拟专家不暴露到前端
    - 默认助手（简单模式）由前端硬编码，不在此接口返回
    """
    try:
        print(f"[API] /api/agents called, user_id: {current_user.id}")

        # 获取用户自定义智能体（按创建时间降序，最新的在前）
        statement = select(CustomAgent).where(
            CustomAgent.user_id == current_user.id,
            CustomAgent.is_default == False  # 排除默认助手
        ).order_by(CustomAgent.created_at.desc())
        print(f"[API] Query statement created")

        custom_agents = session.exec(statement).all()
        print(f"[API] Query executed, found {len(custom_agents)} custom agents")

        # 构建返回结果
        result = []

        # 添加自定义智能体
        for agent in custom_agents:
            print(f"[API] Processing agent: {agent.id} - {agent.name}")
            result.append({
                "id": str(agent.id),
                "name": agent.name,
                "description": agent.description or "",
                "system_prompt": agent.system_prompt,
                "category": agent.category,
                "model_id": agent.model_id,
                "conversation_count": agent.conversation_count,
                "is_public": agent.is_public,
                "is_default": False,
                "created_at": agent.created_at.isoformat() if agent.created_at else None,
                "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
                "is_builtin": False
            })

        print(f"[API] Returning agents: {len(result)} items (custom only)")
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
    """
    删除自定义智能体

    注意：
    - 禁止删除默认助手（is_default=True）
    - 只能删除用户自己的智能体
    """
    agent = session.get(CustomAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise NotFoundError(resource="智能体")

    # 禁止删除默认助手
    if agent.is_default:
        raise AppError(message="禁止删除默认助手")

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

    # 如果是AI助手会话（复杂模式），加载TaskSession和SubTask
    if conversation.agent_type == "ai" and conversation.task_session_id:
        task_session = session.get(TaskSession, conversation.task_session_id)
        if task_session:
            # 加载SubTasks
            statement = select(SubTask).where(SubTask.task_session_id == task_session.session_id)
            sub_tasks = session.exec(statement).all()

            # 构建响应数据（字典形式）- 明确包含 agent_type 字段
            return {
                "id": conversation.id,
                "title": conversation.title,
                "agent_id": conversation.agent_id,
                "agent_type": conversation.agent_type,
                "user_id": conversation.user_id,
                "task_session_id": conversation.task_session_id,
                "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
                "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
                "task_session": {
                    "session_id": task_session.session_id,
                    "user_query": task_session.user_query,
                    "final_response": task_session.final_response,
                    "status": task_session.status,
                    "sub_tasks": [
                        {
                            "id": st.id,
                            "task_session_id": st.task_session_id,
                            "expert_type": st.expert_type,
                            "task_description": st.task_description,
                            "status": st.status,
                            "output": st.output,
                            "error": st.error,
                            "artifacts": st.artifacts,
                            "duration_ms": st.duration_ms,
                            "created_at": st.created_at.isoformat() if st.created_at else None
                        }
                        for st in sub_tasks
                    ]
                }
            }

    # 对于非AI会话，直接返回 conversation 对象
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

# ============================================================================
# 统一聊天端点（简单模式 + 复杂模式）
# ============================================================================

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    print(f"[MAIN] ========== Received chat request ==========")
    print(f"[MAIN] Message content: {request.message}")
    print(f"[MAIN] Agent ID: {request.agentId}")
    print(f"[MAIN] Conversation ID: {request.conversationId}")
    print(f"[MAIN] Stream: {request.stream}")
    print(f"[MAIN] User ID: {current_user.id}")
    print(f"[MAIN] Full request: {request}")

    # 1. 确定 Conversation ID
    conversation_id = request.conversationId
    conversation = None

    if conversation_id:
        conversation = session.get(Conversation, conversation_id)
        if conversation and conversation.user_id != current_user.id:
             raise AuthorizationError("没有权限访问此会话")

    if not conversation:
        # 如果没有ID或找不到，创建新会话
        # 如果前端提供了conversationId（即使是新会话），直接使用前端的ID（幂等性）
        # 只有当conversationId为空时，才生成新的UUID
        if not conversation_id:
            conversation_id = str(uuid.uuid4())

        # 规范化智能体 ID（兼容旧 ID）
        normalized_agent_id = normalize_agent_id(request.agentId)

        # 根据 agentId 确定 agent_type
        if normalized_agent_id == SYSTEM_AGENT_ORCHESTRATOR:
            agent_type = "ai"
        elif normalized_agent_id == SYSTEM_AGENT_DEFAULT_CHAT:
            agent_type = "default"
        else:
            # 尝试作为自定义智能体UUID加载
            custom_agent_check = session.get(CustomAgent, normalized_agent_id)
            if custom_agent_check and custom_agent_check.user_id == current_user.id:
                agent_type = "custom"
            else:
                agent_type = "default"  # 默认值

        conversation = Conversation(
            id=conversation_id,
            title=request.message[:30] + "..." if len(request.message) > 30 else request.message,
            agent_id=normalized_agent_id,  # 使用规范化后的 ID
            agent_type=agent_type,  # 正确设置 agent_type
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
    custom_agent = None

    # 规范化智能体 ID（兼容旧 ID）
    normalized_agent_id = normalize_agent_id(request.agentId)

    # 判断智能体类型：
    # 1. sys-task-orchestrator → 复杂模式（指挥官模式）
    # 2. sys-default-chat → 简单模式（默认助手）
    # 3. 自定义智能体UUID → 简单模式

    print(f"[MAIN] Agent ID: {request.agentId} (normalized: {normalized_agent_id})")

    if normalized_agent_id == SYSTEM_AGENT_ORCHESTRATOR:
        # AI助手：复杂模式（指挥官模式）
        print(f"[MAIN] [AI ASSISTANT MODE] Entering commander workflow")
        custom_agent = None  # 不走自定义 agent 逻辑
    elif normalized_agent_id == SYSTEM_AGENT_DEFAULT_CHAT:
        # 默认助手：简单模式（直接使用常量）
        print(f"[MAIN] [DEFAULT ASSISTANT MODE] Using ASSISTANT_SYSTEM_PROMPT constant")
        # 创建简单的对象用于后续处理
        custom_agent = SimpleNamespace(
            name="默认助手",
            system_prompt=ASSISTANT_SYSTEM_PROMPT,
            model_id=os.getenv("MODEL_NAME", "deepseek-chat"),
            user_id=current_user.id,
            is_default=True
        )
    else:
        # 尝试作为自定义智能体UUID加载
        print(f"[MAIN] Checking custom agent: {normalized_agent_id}")
        custom_agent = session.get(CustomAgent, normalized_agent_id)

        if custom_agent and custom_agent.user_id == current_user.id:
            print(f"[MAIN] [OK] Custom agent detected")
            print(f"[MAIN] [OK] System prompt length: {len(custom_agent.system_prompt)}")
            # 更新使用次数
            custom_agent.conversation_count += 1
            session.add(custom_agent)
            session.commit()
        else:
            print(f"[MAIN] [NOT FOUND] Custom agent not found")
            if custom_agent:
                print(f"[MAIN] [ERROR] User ID mismatch")
            else:
                print(f"[MAIN] [ERROR] Custom agent does not exist")
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

                    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
                    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
                    model_name = custom_agent.model_id or os.getenv("MODEL_NAME", "deepseek-chat")

                    # 自动修正：如果使用 DeepSeek API 但 model_id 是 OpenAI 模型，切换为 deepseek-chat
                    if "deepseek.com" in base_url and model_name.startswith("gpt-"):
                        print(f"[CUSTOM AGENT] 检测到不兼容模型 {model_name}，自动切换为 deepseek-chat")
                        model_name = "deepseek-chat"

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

            api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
            base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
            model_name = custom_agent.model_id or os.getenv("MODEL_NAME", "deepseek-chat")

            # 自动修正：如果使用 DeepSeek API 但 model_id 是 OpenAI 模型，切换为 deepseek-chat
            if "deepseek.com" in base_url and model_name.startswith("gpt-"):
                print(f"[CUSTOM AGENT] 检测到不兼容模型 {model_name}，自动切换为 deepseek-chat")
                model_name = "deepseek-chat"

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
                                'description': expert_info.get('description', ''),
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

    # 启动uvicorn（log_config=None禁用默认日志，避免编码冲突）
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, log_config=None)
