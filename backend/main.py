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
from agents.dynamic_experts import DYNAMIC_EXPERT_FUNCTIONS, initialize_expert_cache
from models import (
    Conversation, Message, User, TaskSession, SubTask,
    CustomAgent, CustomAgentCreate, CustomAgentUpdate, CustomAgentResponse,
    ConversationResponse, MessageResponse
)
from database import create_db_and_tables, get_session, engine
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
from auth import router as auth_router
from api.admin import router as admin_router


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

    async for chunk in llm.astream(messages_with_system):
        content = chunk.content
        if content:
            # SSE 格式：data: {...}\n\n
            event_data = {'content': content}
            if conversation_id:
                event_data['conversationId'] = conversation_id
            yield f"data: {json.dumps(event_data)}\n\n"


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
    # 初始化系统专家数据
    from models import SystemExpert
    from scripts.init_experts import EXPERT_DEFAULTS

    with Session(engine) as session:
        existing_experts = session.exec(select(SystemExpert)).all()
        existing_keys = {e.expert_key for e in existing_experts}

        if not existing_experts:
            print("[Lifespan] No experts found, initializing default experts...")
            for expert_config in EXPERT_DEFAULTS:
                expert = SystemExpert(**expert_config)
                session.add(expert)
            session.commit()
            print(f"[Lifespan] Initialized {len(EXPERT_DEFAULTS)} experts")
        else:
            print(f"[Lifespan] Found {len(existing_experts)} experts in database")
    
    print("[Lifespan] Startup complete, yielding control to Uvicorn...")
    yield
    print("[Lifespan] Shutdown started...")

app = FastAPI(lifespan=lifespan)

# 注册路由
app.include_router(auth_router)
app.include_router(admin_router)  # 管理员 API

# 添加请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    print(f"[REQUEST] {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        print(f"[RESPONSE] {response.status_code} {request.url.path}")
        return response
    except Exception as e:
        print(f"[ERROR] Exception in {request.method} {request.url.path}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

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

# 添加请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"[Main] 收到请求: {request.method} {request.url}")
    print(f"[Main] Headers: {dict(request.headers)}")
    response = await call_next(request)
    print(f"[Main] 响应状态: {response.status_code}")
    return response

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
async def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
    require_auth: bool = False  # 是否强制要求JWT认证
) -> User:
    """
    获取当前用户（优先JWT，回退X-User-ID）

    策略：
    1. 首先检查Authorization头（JWT token）
    2. 如果JWT有效，使用JWT中的user_id
    3. 如果没有JWT，回退到X-User-ID头（向后兼容）
    4. 如果require_auth=True且都没有认证，抛出401错误

    Args:
        request: FastAPI请求对象
        session: 数据库会话
        require_auth: 是否强制要求认证（默认False，向后兼容）

    Returns:
        用户对象
    """
    from utils.jwt_handler import verify_token, AuthenticationError as JWTAuthError

    # 策略1: 尝试从Authorization头获取JWT token
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = verify_token(token, token_type="access")
            user_id = payload["sub"]
            
            user = session.get(User, user_id)
            if user:
                return user
        except JWTAuthError:
            # JWT无效，继续尝试其他方式
            pass

    # 策略2: 回退到X-User-ID头（向后兼容） - 仅在非严格认证模式下使用
    if not require_auth:
        user_id = request.headers.get("X-User-ID")
        if user_id:
            user = session.get(User, user_id)
            if user:
                return user
            else:
                # 未启用严格认证时，自动注册新用户（向后兼容）
                user = User(id=user_id, username=f"User-{user_id[:4]}")
                session.add(user)
                session.commit()
                session.refresh(user)
                return user

    # 策略3: 没有任何认证信息 - 仅在非严格认证模式下使用
    if not require_auth:
        # 未启用严格认证时，使用默认用户（向后兼容）
        user = session.get(User, "default-user")
        if user:
            return user
        else:
            user = User(id="default-user", username="Default User")
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    # 严格认证模式：抛出401错误
    raise HTTPException(
        status_code=401,
        detail="Unauthorized. Please login first."
    )

# --- Helper: Require Authentication ---
async def get_current_user_with_auth(
    request: Request,
    session: Session = Depends(get_session)
) -> User:
    """要求强制JWT认证的依赖（包装 get_current_user）"""
    return await get_current_user(request, session, require_auth=True)

# --- API Endpoints ---

@app.get("/")
async def root():
    return {"status": "ok", "message": "XPouch AI Backend (Python + SQLModel) is running"}

# 用户信息接口
@app.get("/api/user/me")
async def get_user_me(current_user: User = Depends(get_current_user_with_auth)):
    return current_user

@app.put("/api/user/me")
async def update_user_me(request: UpdateUserRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user_with_auth)):
    import sys
    from datetime import datetime
    print(f"[API] 收到更新用户信息请求，用户ID: {current_user.id}", file=sys.stderr)
    print(f"[API] 请求内容: username={request.username}, avatar={'有' if request.avatar else '否'}, plan={request.plan}", file=sys.stderr)

    # 记录更新时间戳
    current_user.updated_at = datetime.now()
    
    if request.username is not None:
        current_user.username = request.username
        print(f"[API] 更新用户名为: {request.username}", file=sys.stderr)
    if request.avatar is not None:
        current_user.avatar = request.avatar
        print(f"[API] 更新头像: {'是' if request.avatar else '否'}", file=sys.stderr)
    if request.plan is not None:
        current_user.plan = request.plan
        print(f"[API] 更新套餐: {request.plan}", file=sys.stderr)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    print(f"[API] 用户信息更新成功: {current_user.username} (更新时间: {current_user.updated_at})", file=sys.stderr)
    return current_user


# ============================================================================
# 调试接口 - 临时用于排查用户问题
# ============================================================================

@app.get("/api/debug/users")
async def debug_list_users(session: Session = Depends(get_session)):
    """列出所有用户（仅用于调试）"""
    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    return {
        "count": len(users),
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "phone_number": u.phone_number,
                "auth_provider": u.auth_provider,
                "created_at": u.created_at.isoformat() if u.created_at else None
            }
            for u in users
        ]
    }

@app.get("/api/debug/verify-token")
async def debug_verify_token(request: Request, session: Session = Depends(get_session)):
    """验证JWT token并返回用户信息（仅用于调试）"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return {"error": "No Authorization header"}

    from utils.jwt_handler import verify_token, AuthenticationError as JWTAuthError

    token = auth_header.split(" ")[1]
    try:
        payload = verify_token(token, token_type="access")
        user_id = payload["sub"]
        user = session.get(User, user_id)

        if user:
            return {
                "token_user_id": user_id,
                "user_found": True,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "phone_number": user.phone_number,
                    "auth_provider": user.auth_provider
                }
            }
        else:
            return {
                "token_user_id": user_id,
                "user_found": False,
                "error": "User not found in database"
            }
    except JWTAuthError as e:
        return {
            "error": "Invalid token",
            "detail": str(e)
        }

@app.delete("/api/debug/cleanup-users")
async def debug_cleanup_users():
    """清理没有手机号的垃圾用户（仅用于调试）"""
    from database import engine
    from sqlalchemy.orm import Session
    import sys
    
    # 创建新的session，不经过get_current_user依赖
    with Session(engine) as session:
        # 查找所有没有手机号的用户
        users_to_delete = session.exec(
            select(User).where(User.phone_number.is_(None))
        ).all()

        count = len(users_to_delete)
        print(f"[Debug] 找到 {count} 个垃圾用户需要清理", file=sys.stderr)

        for user in users_to_delete:
            print(f"[Debug] 删除用户: {user.id} - {user.username}", file=sys.stderr)
            
            # 1. 先删除该用户的所有会话（会级联删除messages）
            conversations = session.exec(
                select(Conversation).where(Conversation.user_id == user.id)
            ).all()
            for conv in conversations:
                print(f"[Debug]   - 删除会话: {conv.id}", file=sys.stderr)
                session.delete(conv)
            
            # 2. 删除该用户的所有自定义智能体
            custom_agents = session.exec(
                select(CustomAgent).where(CustomAgent.user_id == user.id)
            ).all()
            for agent in custom_agents:
                print(f"[Debug]   - 删除智能体: {agent.id} - {agent.name}", file=sys.stderr)
                session.delete(agent)
            
            # 3. 最后删除用户
            session.delete(user)

        session.commit()

        return {
            "deleted_count": count,
            "deleted_users": [{"id": u.id, "username": u.username} for u in users_to_delete]
        }

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
        # 获取用户自定义智能体（按创建时间降序，最新的在前）
        statement = select(CustomAgent).where(
            CustomAgent.user_id == current_user.id,
            CustomAgent.is_default == False  # 排除默认助手
        ).order_by(CustomAgent.created_at.desc())

        custom_agents = session.exec(statement).all()

        # 构建返回结果
        result = []

        # 添加自定义智能体
        for agent in custom_agents:
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


        return result

    except Exception as e:
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
@app.get("/api/conversations", response_model=List[ConversationResponse])
async def get_conversations(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    statement = select(Conversation).where(Conversation.user_id == current_user.id).options(selectinload(Conversation.messages)).order_by(Conversation.updated_at.desc())
    conversations = session.exec(statement).all()
    return [ConversationResponse.model_validate(conv) for conv in conversations]

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

            # 构建响应数据（字典形式）- 明确包含 agent_type 字段和 messages
            return {
                "id": conversation.id,
                "title": conversation.title,
                "agent_id": conversation.agent_id,
                "agent_type": conversation.agent_type,
                "user_id": conversation.user_id,
                "task_session_id": conversation.task_session_id,
                "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
                "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
                "messages": [
                    {
                        "id": msg.id,
                        "role": msg.role,
                        "content": msg.content,
                        "timestamp": msg.timestamp.isoformat() if msg.timestamp else None
                    }
                    for msg in conversation.messages
                ],
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

    # 对于非AI会话，手动构建响应以确保 messages 被序列化
    return {
        "id": conversation.id,
        "title": conversation.title,
        "agent_id": conversation.agent_id,
        "agent_type": conversation.agent_type,
        "user_id": conversation.user_id,
        "task_session_id": conversation.task_session_id,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat() if msg.timestamp else None
            }
            for msg in conversation.messages
        ]
    }

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

    print(f"[DEBUG] normalized_agent_id: {normalized_agent_id}, SYSTEM_AGENT_ORCHESTRATOR: {SYSTEM_AGENT_ORCHESTRATOR}")
    if normalized_agent_id == SYSTEM_AGENT_ORCHESTRATOR:
        # AI助手：复杂模式（指挥官模式）
        custom_agent = None  # 不走自定义 agent 逻辑
    elif normalized_agent_id == SYSTEM_AGENT_DEFAULT_CHAT:
        # 默认助手：简单模式（直接使用常量）
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
        custom_agent = session.get(CustomAgent, normalized_agent_id)

        if custom_agent and custom_agent.user_id == current_user.id:
            # 更新使用次数
            custom_agent.conversation_count += 1
            session.add(custom_agent)
            session.commit()
        else:
            custom_agent = None

    # 如果是自定义智能体，使用直接 LLM 调用模式（不经过 LangGraph）
    print(f"[DEBUG] custom_agent value: {custom_agent}")
    if custom_agent:
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

                    async for chunk in llm.astream(messages_with_system):
                        content = chunk.content
                        if content:
                            full_response += content
                            yield f"data: {json.dumps({'content': content, 'conversationId': conversation_id})}\n\n"

                except Exception as e:
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

    # 4. 流式响应处理
    if request.stream:
        async def event_generator():
            full_response = ""
            event_count = 0

            # 为每个专家维护 artifact 列表（支持多个 artifact 累积）
            expert_artifacts = {}

            try:
                print(f"[DEBUG] 开始流式处理指挥官图，初始状态: {initial_state}")
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

                    # 捕获指挥官节点执行结束（获取任务计划）
                    if kind == "on_chain_end" and name == "commander":
                        output_data = event["data"]["output"]

                        if "__task_plan" in output_data:
                            task_plan = output_data["__task_plan"]
                            # 推送任务计划事件到前端
                            yield f"data: {json.dumps({'taskPlan': task_plan, 'conversationId': conversation_id})}\n\n"

                    # 捕获聚合器节点执行结束（获取最终响应）
                    if kind == "on_chain_end" and name == "aggregator":
                        output_data = event["data"]["output"]

                        if "final_response" in output_data:
                            final_response = output_data["final_response"]
                            # 推送最终响应到前端
                            yield f"data: {json.dumps({'content': final_response, 'conversationId': conversation_id, 'isFinal': True})}\n\n"

                    # 捕获专家分发器节点开始执行（推送任务开始信息）
                    if kind == "on_chain_start" and name == "expert_dispatcher":
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
                            yield f"data: {json.dumps({'taskStart': task_start_info, 'conversationId': conversation_id})}\n\n"

                    # 捕获专家分发器节点执行（通过 __expert_info 字段传递专家信息）
                    if kind == "on_chain_end" and name == "expert_dispatcher":
                        output_data = event["data"]["output"]

                        # 移除重复的 __task_start_info 处理（现在在 on_chain_start 时处理）
                        if "__expert_info" in output_data:
                            expert_info = output_data["__expert_info"]
                            expert_name = expert_info.get("expert_type")
                            expert_status = expert_info.get("status", "completed")
                            duration_ms = expert_info.get("duration_ms", 0)
                            output_result = expert_info.get("output", "")
                            expert_error = expert_info.get("error")

                            # 初始化该专家的 artifact 列表
                            if expert_name not in expert_artifacts:
                                expert_artifacts[expert_name] = []

                            # 推送专家激活事件（在专家开始执行时）
                            yield f"data: {json.dumps({'activeExpert': expert_name, 'conversationId': conversation_id})}\n\n"

                            # 检查是否生成了 artifact
                            if "artifact" in output_data:
                                artifact = output_data["artifact"]
                                # 添加到该专家的 artifact 列表
                                expert_artifacts[expert_name].append(artifact)

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

                    # 捕获 LLM 流式输出
                    if kind == "on_chat_model_stream":
                        content = event["data"]["chunk"].content
                        if content:
                            full_response += content
                            yield f"data: {json.dumps({'content': content, 'conversationId': conversation_id})}\n\n"

                print(f"[STREAM] 流式处理完成，共处理 {event_count} 个事件")

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
                    task_description=subtask["description"],
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
                task_description=subtask_dict["description"],
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
    print(f"[STARTUP] Starting Uvicorn server on port {port}...")
    print(f"[STARTUP] Host: 0.0.0.0, Port: {port}")

    try:
        # 启动uvicorn（禁用reload避免Windows文件监控问题）
        uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, log_level="info")
    except Exception as e:
        print(f"[STARTUP ERROR] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise
