"""
LangGraph 数据库连接工具
提供异步连接池给 AsyncPostgresSaver 使用
"""

import os
from contextlib import asynccontextmanager

from psycopg_pool import AsyncConnectionPool

from utils.logger import logger

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in environment variables")

# 转换为 psycopg 格式（去掉 +asyncpg 等驱动后缀）
PSYCOPG_DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg", "postgresql").replace(
    "postgresql+psycopg", "postgresql"
)

# 添加 TCP keepalive 参数，防止长时间等待时连接被关闭
if "keepalives" not in PSYCOPG_DATABASE_URL:
    separator = "&" if "?" in PSYCOPG_DATABASE_URL else "?"
    PSYCOPG_DATABASE_URL += (
        f"{separator}keepalives=1&keepalives_idle=60&keepalives_interval=30&keepalives_count=3"
    )


async def _configure_connection(conn):
    """配置新连接（当前无额外配置，TCP keepalive 已在 URL 中设置）"""
    pass


async def _check_connection(conn):
    """连接健康检查"""
    try:
        orig_autocommit = conn.autocommit
        conn.autocommit = True
        try:
            await conn.execute("SELECT 1")
            return True
        finally:
            conn.autocommit = orig_autocommit
    except Exception as e:
        logger.warning(f"[DB] Connection health check failed: {e}")
        return False


async def _reset_connection(conn):
    """连接重置 - 清理残留事务状态"""
    try:
        if conn.info.transaction_status != 0:
            await conn.rollback()
    except Exception as e:
        logger.warning(f"[DB] Connection reset failed: {e}")


# 全局连接池（单例模式）
_pool = None


def get_connection_pool() -> AsyncConnectionPool:
    """获取或创建异步连接池"""
    from config import settings

    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            conninfo=PSYCOPG_DATABASE_URL,
            open=False,
            min_size=settings.db_pool_min_size,
            max_size=settings.db_pool_max_size,
            timeout=settings.db_pool_timeout,
            max_idle=settings.db_pool_max_idle,
            max_lifetime=settings.db_pool_max_lifetime,
            configure=_configure_connection,
            check=_check_connection,
            reset=_reset_connection,
            reconnect_timeout=60,
        )
    return _pool


async def reset_connection_pool():
    """重置连接池（用于错误恢复）"""
    global _pool
    if _pool is not None:
        try:
            await _pool.close()
        except Exception as e:
            logger.warning(f"[DB] Failed to close connection pool: {e}")
        _pool = None
        logger.info("[DB] Connection pool reset")


@asynccontextmanager
async def get_db_connection():
    """
    获取数据库连接的异步上下文管理器
    包含错误恢复机制
    """
    pool = get_connection_pool()
    if pool.closed:
        await pool.open()

    async with pool.connection() as conn:
        # 重置连接状态
        try:
            if conn.info.transaction_status != 0:
                await conn.rollback()
        except Exception as e:
            logger.warning(f"[DB] Failed to reset connection state: {e}")
        yield conn


async def init_checkpointer_tables():
    """
    初始化 LangGraph Checkpointer 所需的表结构
    注意：表结构已由 fix_checkpoint_table.py 创建，这里仅做检查
    """
    import psycopg

    logger.info("[HITL] Checking checkpointer tables...")

    try:
        with psycopg.connect(PSYCOPG_DATABASE_URL) as conn, conn.cursor() as cur:
            # 检查所有必需的表
            cur.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name LIKE 'checkpoint%'
            """)
            tables = [row[0] for row in cur.fetchall()]

            required = [
                "checkpoints",
                "checkpoint_blobs",
                "checkpoint_writes",
                "checkpoint_migrations",
            ]
            missing = [t for t in required if t not in tables]

            if missing:
                logger.warning(f"[HITL WARN] Missing tables: {missing}")
                logger.warning("[HITL] Please run: uv run python fix_checkpoint_table.py")
            else:
                logger.info("[HITL] All checkpointer tables exist")

    except Exception as e:
        logger.warning(f"[HITL WARN] Failed to check tables: {e}")


async def close_connection_pool():
    """关闭连接池"""
    global _pool
    if _pool is not None and not _pool.closed:
        await _pool.close()
        logger.info("[DB] Connection pool closed")
