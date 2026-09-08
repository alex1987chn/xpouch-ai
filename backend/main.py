"""
XPouch AI Backend - 入口文件

重构后：仅负责 App 初始化、中间件、注册路由
业务逻辑已拆分到 routers/ 目录

🔥 启动方式：
- Windows: python run.py (已处理事件循环兼容性)
- Linux/Mac: python main.py 或 uvicorn main:app
"""

import asyncio
import pathlib

from dotenv import load_dotenv

# Load .env from the same directory as this file
env_path = pathlib.Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

from contextlib import asynccontextmanager

# ============================================================================
# 时间序列化约定（P7 UTC 化配套）
# ============================================================================
# DB 时间列统一存 naive UTC（utils/time.utc_now_naive）。FastAPI 默认把
# naive datetime 序列化为无时区后缀的 ISO 串，浏览器会按本地时区解析——
# 服务器本地化时代恰好成立，UTC 化后会把时间显示成 8 小时后。此处全局
# 为 naive datetime 追加 "Z"，明确告知前端"这是 UTC"。
from datetime import datetime as _dt

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from api.admin import router as admin_router
from api.library import router as library_router
from api.tools import router as tools_router

# 路由导入
from auth import router as auth_router
from config import settings

# 内部模块导入
from database import create_db_and_tables, engine
from models import SkillTemplate, SystemExpert
from routers import agents, chat, mcp, public, runs, stats, system
from utils.exceptions import AppError, handle_error
from utils.logger import logger

ENCODERS_BY_TYPE[_dt] = lambda o: o.isoformat() + "Z"

# ============================================================================
# Lifespan - 应用生命周期管理
# ============================================================================


def _init_experts_sync():
    """同步初始化系统专家数据（在后台线程中执行）"""
    from expert_config import EXPERT_DEFAULTS

    with Session(engine) as session:
        existing_experts = session.exec(select(SystemExpert)).all()

        if not existing_experts:
            logger.info("[Lifespan] No experts found, initializing default experts...")
            for expert_config in EXPERT_DEFAULTS:
                expert = SystemExpert(**expert_config)
                session.add(expert)
            session.commit()
            logger.info(f"[Lifespan] Initialized {len(EXPERT_DEFAULTS)} experts")
        else:
            logger.info(f"[Lifespan] Found {len(existing_experts)} experts in database")


def _init_library_templates_sync():
    """同步初始化 Library 默认模板。"""
    from library_defaults import TEMPLATE_DEFAULTS

    with Session(engine) as session:
        existing_keys = {
            template.template_key for template in session.exec(select(SkillTemplate)).all()
        }
        for template_config in TEMPLATE_DEFAULTS:
            if template_config["template_key"] in existing_keys:
                continue
            session.add(SkillTemplate(**template_config))
        session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 初始化配置
    logger.info(f"启动环境: {settings.environment}")
    settings.init_langsmith()
    if not settings.validate():
        logger.error("配置验证失败")
        if settings.is_production:
            raise RuntimeError("生产环境配置验证失败")
    # 创建数据库表
    create_db_and_tables()

    # 🔥 Checkpointer 初始化：官方 AsyncPostgresSaver.setup()（幂等，按
    #    checkpoint_migrations 版本表补齐表结构），替代手搓检查 DDL
    from utils.db import setup_shared_checkpointer

    try:
        # 预热共享 checkpointer（绑定连接池 + msgpack 白名单 serializer + setup 建表）
        await setup_shared_checkpointer()
        logger.info("[Lifespan] Shared checkpointer ready (pool-backed)")
    except Exception as e:
        logger.warning(f"[Lifespan WARN] Failed to set up checkpointer: {e}")
        # 非致命错误，继续启动
        logger.info("[Lifespan INFO] Run migrations if complex mode is not working:")
        logger.info("              - Linux/macOS: cd backend/migrations && ./run_all_migrations.sh")
        logger.info("              - Windows: cd backend/migrations && .\\run_all_migrations.ps1")

    # 初始化系统专家数据（使用 asyncio.to_thread 避免阻塞事件循环）
    await asyncio.to_thread(_init_experts_sync)
    await asyncio.to_thread(_init_library_templates_sync)

    # 🔥 初始化管理员（从环境变量）
    from utils.admin_init import init_admin_from_env

    def _init_admin_sync():
        """同步初始化管理员（在后台线程中执行）"""
        with Session(engine) as session:
            init_admin_from_env(session, settings.initial_admin_email, settings.initial_admin_phone)

    try:
        await asyncio.to_thread(_init_admin_sync)
    except Exception as e:
        logger.warning(f"[Lifespan] 初始化管理员失败（非致命错误）: {e}")

    # 清空专家缓存，确保使用最新的兜底机制重新加载
    from agents.services.expert_manager import force_refresh_all

    force_refresh_all()
    logger.info("[Lifespan] Expert cache cleared for fresh start")

    logger.info("[Lifespan] Startup complete, yielding control to Uvicorn...")
    from services.session_cleanup_service import run_session_cleanup_loop

    cleanup_task = asyncio.create_task(run_session_cleanup_loop())
    yield
    logger.info("[Lifespan] Shutdown started...")

    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        logger.info("[Lifespan] Session cleanup task stopped")

    # 🔥 关闭连接池
    from utils.db import close_connection_pool

    try:
        await close_connection_pool()
        logger.info("[Lifespan] Connection pool closed")
    except Exception as e:
        logger.warning(f"[Lifespan WARN] Failed to close connection pool: {e}")


# ============================================================================
# FastAPI 应用实例
# ============================================================================

app = FastAPI(
    title="XPouch AI Backend",
    description="Python + SQLModel + LangGraph backend",
    version=settings.version,
    lifespan=lifespan,
)

# 注册路由
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(library_router)
app.include_router(tools_router)
app.include_router(chat.router)
app.include_router(agents.router)
app.include_router(system.router)
app.include_router(mcp.router)
app.include_router(runs.router)
app.include_router(stats.router)
app.include_router(public.router)


# ============================================================================
# 中间件
# ============================================================================


@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    """请求日志中间件"""
    logger.info(f"[REQUEST] {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"[RESPONSE] {response.status_code} {request.url.path}")
        return response
    except Exception as e:
        logger.error(
            f"[ERROR] Exception in {request.method} {request.url.path}: {str(e)}", exc_info=True
        )
        raise


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """安全头信息中间件"""
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    csp_policy = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    )
    response.headers["Content-Security-Policy"] = csp_policy
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


# ============================================================================
# CORS 配置
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,  # P0 修复: 允许携带 Cookie（HttpOnly Token）
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-User-ID", "X-Request-ID"],
)


# ============================================================================
# 异常处理器
# ============================================================================


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    logger.warning(
        "[VALIDATION ERROR] path=%s errors=%s body_omitted=true",
        request.url.path,
        exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
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
    logger.error(f"[HTTP ERROR] {exc.status_code}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": str(exc.detail), "details": {}}},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """处理未捕获的异常"""
    # 仅在开发环境输出完整堆栈
    is_debug = settings.is_development
    logger.error(
        f"[UNHANDLED ERROR] {type(exc).__name__}: {str(exc)} | Path: {request.url.path}",
        exc_info=is_debug,
    )

    # 脱敏：未捕获异常的内部细节（SQL、路径、依赖报错文本）不回传客户端；
    # 已知业务异常（ValueError/KeyError/TypeError 等映射结果）保持原语义。
    if settings.is_production:
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "服务器内部错误，请稍后重试",
                    "details": {},
                }
            },
        )

    app_error = handle_error(exc)
    return JSONResponse(
        status_code=app_error.status_code,
        content=app_error.to_dict(),
    )


# ============================================================================
# 启动入口
# ============================================================================

if __name__ == "__main__":
    port = settings.port
    logger.info(f"[STARTUP] Starting Uvicorn server on port {port}...")
    logger.info(f"[STARTUP] Host: 0.0.0.0, Port: {port}")

    try:
        uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, log_level="info")
    except Exception as e:
        logger.error(f"[STARTUP ERROR] {type(e).__name__}: {e}", exc_info=True)
        raise
