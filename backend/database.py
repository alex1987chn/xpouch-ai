"""数据库引擎与会话（全异步，2026-09-27 半异步治理收官）。

运行时唯一引擎 = SQLAlchemy async engine（psycopg3 一方言双模，URL 与
同步版同形）。两类场景**刻意**保持同步、走独立同步引擎，均为官方模式
而非兼容层：
- Alembic 迁移（migrations/env.py 自带 sync URL）
- 离线 CLI/脚本（promote_admin 等，`create_offline_sync_engine()`）

`expire_on_commit=False` 是 SQLAlchemy 官方对 async 的推荐配置：提交后
不隐式刷新属性，避免属性访问触发后台 IO（也是"Session 关闭后摸属性
抛 DetachedInstanceError"那类事故的结构性免疫）。

asyncio 慢回调观测：设 `ASYNCIO_DEBUG=1` 开启官方 debug 模式
（loop.slow_callback_duration 默认 100ms 即告警），迁移排障与生产
巡检共用这一个开关，不自造看门狗。
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    async_sessionmaker,
    create_async_engine,
)
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession as SQLModelAsyncSession

from config import settings
from utils.logger import logger

DATABASE_URL = settings.get_database_url(sync_driver="psycopg")

# PostgreSQL 配置 - 连接池按单 worker 单实例 uvicorn 调优（见 docs/self-hosting.md）。
# 池参数与原同步引擎一致；psycopg3 异步方言与同步共用同一 URL 形态。
engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=20,
    # 允许临时溢出的连接数
    max_overflow=10,
    # 🔥 每 300秒 (5分钟) 回收连接，防止云数据库 idle timeout 导致的"死链接"
    # 云环境通常 600s 开始清理，我们主动在 300s 时"转生"，确保连接永远"壮年"
    pool_recycle=300,
    # 🔥 每次取连接前 ping 一下，确保连接活着 (虽然有一点点性能损耗，但极其稳定)
    pool_pre_ping=True,
)

# 非依赖注入场景的会话工厂（官方 async_sessionmaker；此前是 `Session`
# 类别名——全异步后凡直建会话一律 `async with SessionFactory() as ...`）
SessionFactory = async_sessionmaker(
    engine,
    class_=SQLModelAsyncSession,
    expire_on_commit=False,
)

logger.info("[Database] Using PostgreSQL (async engine): %s", settings.get_masked_database_url())
logger.info(
    "[Database] Connection pool: size=20, max_overflow=10, pool_recycle=300s, pool_pre_ping=True"
)


def create_offline_sync_engine():
    """离线 CLI/脚本专用的同步引擎（alembic 同款 URL 与模式）。

    运行时服务代码**禁止**使用本函数——它只为无法进入事件循环的
    独立进程（运维脚本）服务，与迁移共用同一同步口径。
    """
    from sqlmodel import create_engine

    return create_engine(
        settings.get_database_url(sync_driver="psycopg"),
        pool_pre_ping=True,
    )


def create_db_and_tables():
    """启动时 schema 对齐——所有环境统一走 Alembic（单一真相源）。

    create_all 已退役：开发/生产双真相源并存时，create_all 会静默补表，
    掩盖"库缺迁移"的事实（如 last_login_at 事故）。缺迁移即失败并提示。
    Alembic 官方模式即同步执行（env.py 自带 sync engine），故本函数保持同步。
    """
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    ini_path = Path(__file__).parent / "alembic.ini"
    alembic_cfg = Config(str(ini_path))
    # script_location 以 ini 所在目录为基准，避免工作目录差异
    alembic_cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    command.upgrade(alembic_cfg, "head")
    logger.info("[Database] schema aligned via Alembic (upgrade head)")


async def get_session() -> AsyncIterator[SQLModelAsyncSession]:
    """FastAPI 依赖：请求级 AsyncSession（官方 async generator 依赖模式）。"""
    async with SessionFactory() as session:
        yield session


__all__ = [
    "DATABASE_URL",
    "SessionFactory",
    "SQLModel",
    "SQLModelAsyncSession",
    "create_db_and_tables",
    "create_offline_sync_engine",
    "engine",
    "get_session",
]
