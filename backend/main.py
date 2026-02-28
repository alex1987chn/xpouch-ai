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
from typing import Optional
import uvicorn
from sqlmodel import Session, select
from contextlib import asynccontextmanager
from utils.logger import logger

# 内部模块导入
from database import create_db_and_tables, engine, get_session
from config import init_langchain_tracing, validate_config
from models import User, SystemExpert
from constants import SYSTEM_AGENT_DEFAULT_CHAT
from utils.exceptions import (
    AppError, ValidationError,
    handle_error
)

# 路由导入
from auth import router as auth_router
from api.admin import router as admin_router
from routers import chat, agents, system, mcp


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

    # 🔥🔥🔥 v3.1.0: 检查 LangGraph Checkpointer 表
    # 注意：Checkpoint 表由 migrations/checkpoint_tables.sql 创建，支持复杂模式
    from utils.db import init_checkpointer_tables
    try:
        await init_checkpointer_tables()
        print("[Lifespan] Checkpointer tables verified for HITL")
    except Exception as e:
        print(f"[Lifespan WARN] Failed to verify checkpointer tables: {e}")
        # 非致命错误，继续启动
        print("[Lifespan INFO] Run migrations if complex mode is not working:")
        print("              - Linux/macOS: cd backend/migrations && ./run_all_migrations.sh")
        print("              - Windows: cd backend/migrations && .\\run_all_migrations.ps1")

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
app.include_router(mcp.router)


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
        logger.error(f"[ERROR] Exception in {request.method} {request.url.path}: {str(e)}", exc_info=True)
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
    allow_credentials=True,  # P0 修复: 允许携带 Cookie（HttpOnly Token）
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
    logger.error(f"[APP ERROR] {exc.code}: {exc.message}", exc_info=exc.original_error is not None)
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
    logger.error(
        f"[UNHANDLED ERROR] {type(exc).__name__}: {str(exc)} | Path: {request.url.path}",
        exc_info=True
    )

    app_error = handle_error(exc)
    return JSONResponse(
        status_code=app_error.status_code,
        content=app_error.to_dict(),
    )


# ============================================================================
# 双模路由端点
# 业务逻辑已迁移到 services/invoke_service.py
# ============================================================================

from services.invoke_service import InvokeService, get_invoke_service
from dependencies import get_current_user


class ChatInvokeRequest(BaseModel):
    """双模路由请求模型"""
    message: str
    mode: str = "auto"  # "auto" 或 "direct"
    agent_id: Optional[str] = None  # direct 模式下必填
    thread_id: Optional[str] = None  # LangSmith 线程 ID


@app.post("/api/v1/chat/invoke")
async def chat_invoke_endpoint(
    request: ChatInvokeRequest,
    service: InvokeService = Depends(get_invoke_service),
    current_user: User = Depends(get_current_user)
):
    """
    双模路由端点：支持 Auto 和 Direct 两种执行模式
    
    Auto 模式：完整的多专家协作流程（commander_graph）
    Direct 模式：直接调用单个专家
    """
    logger.info(f"[INVOKE] 模式: {request.mode}, Agent: {request.agent_id}")
    
    try:
        # 使用 InvokeService 执行业务逻辑
        result = await service.invoke(
            message=request.message,
            mode=request.mode,
            agent_id=request.agent_id,
            thread_id=request.thread_id,
            user=current_user
        )
        
        return {
            **result,
            "user_query": request.message,
            "status": "completed"
        }
        
    except ValidationError:
        # 验证错误已包含详细信息，直接抛出
        raise
    except Exception as e:
        # 其他错误包装为 AppError
        logger.error(f"[INVOKE ERROR] {e}", exc_info=True)
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
        logger.error(f"[STARTUP ERROR] {type(e).__name__}: {e}", exc_info=True)
        raise
