"""
XPouch AI Backend - 入口文件

重构后：仅负责 App 初始化、中间件、注册路由
业务逻辑已拆分到 routers/ 目录

🔥 启动方式：
- Windows: python run.py (已处理事件循环兼容性)
- Linux/Mac: python main.py 或 uvicorn main:app
"""
import pathlib
from dotenv import load_dotenv
import os

# Load .env from the same directory as this file
env_path = pathlib.Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import json
import uvicorn
from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, select
from contextlib import asynccontextmanager

# 内部模块导入
from database import create_db_and_tables, engine, get_session
from config import init_langchain_tracing, validate_config
from models import User, TaskSession, SubTask, SystemExpert
from constants import SYSTEM_AGENT_DEFAULT_CHAT
from agents.graph import commander_graph
from agents.nodes.generic import generic_worker_node
from agents.services.expert_manager import get_expert_config_cached
from utils.llm_factory import get_llm_instance
from utils.exceptions import (
    AppError, ValidationError, NotFoundError,
    handle_error
)

# 路由导入
from auth import router as auth_router
from api.admin import router as admin_router
from routers import chat, agents, system


# ============================================================================
# Lifespan - 应用生命周期管理
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 初始化 LangSmith 追踪
    init_langchain_tracing()
    # 验证配置
    validate_config()
    # 创建数据库表
    create_db_and_tables()

    # 🔥🔥🔥 v3.5: 初始化 LangGraph Checkpointer 表 (HITL 支持)
    from utils.db import init_checkpointer_tables
    try:
        await init_checkpointer_tables()
        print("[Lifespan] Checkpointer tables initialized for HITL")
    except Exception as e:
        print(f"[Lifespan WARN] Failed to init checkpointer tables: {e}")
        # 非致命错误，继续启动

    # 初始化系统专家数据
    from expert_config import EXPERT_DEFAULTS

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

    # 清空专家缓存，确保使用最新的兜底机制重新加载
    from agents.services.expert_manager import force_refresh_all
    force_refresh_all()
    print("[Lifespan] Expert cache cleared for fresh start")

    print("[Lifespan] Startup complete, yielding control to Uvicorn...")
    yield
    print("[Lifespan] Shutdown started...")
    
    # 🔥 关闭连接池
    from utils.db import close_connection_pool
    try:
        await close_connection_pool()
        print("[Lifespan] Connection pool closed")
    except Exception as e:
        print(f"[Lifespan WARN] Failed to close connection pool: {e}")


# ============================================================================
# FastAPI 应用实例
# ============================================================================

app = FastAPI(
    title="XPouch AI Backend",
    description="Python + SQLModel + LangGraph backend",
    version="2.0.0",
    lifespan=lifespan
)

# 注册路由
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(chat.router)
app.include_router(agents.router)
app.include_router(system.router)


# ============================================================================
# 中间件
# ============================================================================

@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    """请求日志中间件"""
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


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """安全头信息中间件"""
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    csp_policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    response.headers["Content-Security-Policy"] = csp_policy
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


# ============================================================================
# CORS 配置
# ============================================================================

def get_cors_origins():
    """从环境变量 CORS_ORIGINS 读取允许的来源"""
    cors_origins_str = os.getenv("CORS_ORIGINS", "").strip()
    if cors_origins_str:
        origins = [origin.strip() for origin in cors_origins_str.split(",")]
        print(f"[CORS] 允许的来源: {origins}")
        return origins
    
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        print("[WARN] 生产环境未设置 CORS_ORIGINS，CORS 将拒绝所有跨域请求")
        return []
    else:
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


# ============================================================================
# 异常处理器
# ============================================================================

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
    
    app_error = handle_error(exc)
    return JSONResponse(
        status_code=app_error.status_code,
        content=app_error.to_dict(),
    )


# ============================================================================
# 双模路由：保留在 main.py（新开发的功能，稳定后再迁移）
# ============================================================================

class ChatInvokeRequest(BaseModel):
    """双模路由请求模型"""
    message: str
    mode: str = "auto"  # "auto" 或 "direct"
    agent_id: Optional[str] = None  # direct 模式下必填
    thread_id: Optional[str] = None  # LangSmith 线程 ID


from dependencies import get_current_user


@app.post("/api/v1/chat/invoke")
async def chat_invoke_endpoint(
    request: ChatInvokeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    双模路由端点：支持 Auto 和 Direct 两种执行模式

    Auto 模式：完整的多专家协作流程（commander_graph）
    Direct 模式：直接调用单个专家
    """
    print(f"[INVOKE] 模式: {request.mode}, Agent: {request.agent_id}")

    # 1. 模式验证
    if request.mode not in ["auto", "direct"]:
        raise ValidationError(f"无效的执行模式: {request.mode}，必须是 'auto' 或 'direct'")

    # 2. Direct 模式需要 agent_id
    if request.mode == "direct" and not request.agent_id:
        raise ValidationError("Direct 模式需要指定 agent_id")

    # 3. 验证 agent_id 是否存在（使用 expert_loader）
    if request.mode == "direct":
        expert_config = get_expert_config_cached(request.agent_id)
        if not expert_config:
            raise ValidationError(f"未知的专家类型: {request.agent_id}")

    # 4. 创建 TaskSession 记录
    from langchain_core.messages import HumanMessage
    
    thread_id = request.thread_id or str(uuid4())
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

    # 使用工厂函数获取 LLM 实例
    llm = get_llm_instance(streaming=True, temperature=0.7)

    # 5. 根据模式执行
    try:
        if request.mode == "auto":
            # Auto 模式：完整的多专家协作流程
            print("[AUTO MODE] 启动完整工作流")

            initial_state = {
                "messages": [HumanMessage(content=request.message)],
                "task_list": [],
                "current_task_index": 0,
                "strategy": "",
                "expert_results": [],
                "final_response": ""
            }

            final_state = await commander_graph.ainvoke(
                initial_state,
                config={
                    "recursion_limit": 100,  # 🔥 设置递归限制（放在顶层！）
                    "configurable": {
                        "thread_id": thread_id
                    }
                }
            )

            # 保存 SubTask 到数据库
            for subtask in final_state["task_list"]:
                artifacts = subtask.get("artifact")
                if artifacts:
                    artifacts = [artifacts] if isinstance(artifacts, dict) else artifacts

                db_subtask = SubTask(
                    id=subtask["id"],
                    expert_type=subtask["expert_type"],
                    task_description=subtask["description"],
                    input_data=subtask["input_data"],
                    status=subtask["status"],
                    output_result=subtask["output_result"],
                    artifacts=artifacts,
                    started_at=subtask.get("started_at"),
                    completed_at=subtask.get("completed_at"),
                    created_at=subtask.get("created_at"),
                    updated_at=subtask.get("updated_at"),
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
            # Direct 模式：直接调用单个专家
            print(f"[DIRECT MODE] 直接调用专家: {request.agent_id}")

            subtask_dict = {
                "id": str(uuid4()),
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

            # 使用 generic_worker_node 统一执行专家
            result = await generic_worker_node(initial_state)

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
        # 错误处理
        task_session.status = "failed"
        task_session.final_response = f"执行失败: {str(e)}"
        task_session.updated_at = datetime.now()
        session.commit()

        print(f"[ERROR] 执行失败: {e}")
        raise AppError(message=f"执行失败: {str(e)}", original_error=e)


# ============================================================================
# 启动入口
# ============================================================================

if __name__ == "__main__":
    port = int(os.getenv("PORT", 3002))
    print(f"[STARTUP] Starting Uvicorn server on port {port}...")
    print(f"[STARTUP] Host: 0.0.0.0, Port: {port}")

    try:
        uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, log_level="info")
    except Exception as e:
        print(f"[STARTUP ERROR] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise
