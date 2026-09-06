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
# 🔥 激进版：30s 无数据就开始探测，每 10s 敲一次，连敲 3 次没回就判定死亡
# 这样能欺骗中间防火墙，让 26s+ 的专家任务期间连接不被掐断
if "keepalives" not in PSYCOPG_DATABASE_URL:
    separator = "&" if "?" in PSYCOPG_DATABASE_URL else "?"
    PSYCOPG_DATABASE_URL += (
        f"{separator}keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=3"
    )


async def _configure_connection(conn):
    """配置新连接（当前无额外配置，TCP keepalive 已在 URL 中设置）"""
    pass


async def _check_connection(conn):
    """连接健康检查。

    注意：psycopg3 异步连接的 autocommit 属性只读（曾经直接赋值导致每次检查都告警），
    SELECT 产生的事务态由这里的 rollback 与连接池的 reset 回调兜底清理。
    """
    try:
        await conn.execute("SELECT 1")
        if conn.info.transaction_status != 0:
            await conn.rollback()
        return True
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


def get_checkpointer_serializer():
    """checkpoint 序列化器（msgpack 白名单）。

    state 中的自定义枚举（task_list 携带 TaskStatus）必须显式注册，
    否则 langgraph 会警告并将在未来版本直接拒绝反序列化（HITL 恢复全挂）。
    注意：白名单格式为 (模块点路径, 类名)；通配符会静默降级为 str，不可用。
    """
    from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

    return JsonPlusSerializer(allowed_msgpack_modules=[("models.enums", "TaskStatus")])


# 共享 checkpointer 单例：直接绑定连接池（每个操作从池借还连接，用完即还），
# 替代"每个聊天流独占一条池连接整个流时长"的模式（并发流会占满连接池）。
# AsyncPostgresSaver 构造器原生支持 AsyncConnectionPool（无 pipeline 时）。
_shared_saver = None


def get_shared_checkpointer():
    """获取绑定到全局连接池的共享 AsyncPostgresSaver（首次调用时创建）。"""
    global _shared_saver
    if _shared_saver is None:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        _shared_saver = AsyncPostgresSaver(
            get_connection_pool(), serde=get_checkpointer_serializer()
        )
    return _shared_saver


async def setup_shared_checkpointer() -> None:
    """应用启动时调用：建表并预热共享 checkpointer（lifespan 钩子）。"""
    pool = get_connection_pool()
    if pool.closed:
        await pool.open()
    saver = get_shared_checkpointer()
    await saver.setup()


async def delete_checkpoints_for_thread(thread_id: str, run_ids: list[str] | None = None) -> int:
    """删除 thread 及其隔离线程（{thread_id}_{run_id}）的 checkpoint 数据。

    LangGraph 无自动清理/TTL（此前仅"拒绝计划"路径删除，checkpoint 表随每条消息
    新建的隔离线程无限增长）；run 到达终态或线程被清理时应调用本函数。
    """
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    target_ids = [thread_id] + [f"{thread_id}_{run_id}" for run_id in (run_ids or [])]
    deleted = 0
    remaining_after = -1
    async with get_db_connection() as conn:
        saver = AsyncPostgresSaver(conn, serde=get_checkpointer_serializer())
        for target in target_ids:
            try:
                await saver.adelete_thread(target)
                deleted += 1
            except Exception as e:
                logger.warning(f"[DB] 删除 checkpoint 失败 thread={target}: {e}")
        # 诊断插桩：删除后立即在同连接计数（0=删净，之后再现=有回写者）
        row = await conn.execute(
            "SELECT count(*) FROM checkpoints WHERE thread_id = ANY(%s)", (target_ids,)
        )
        remaining_after = (await row.fetchone())[0]
    logger.info(
        "[DB] checkpoint 清理: %s/%s 个线程, 删后残留 %s（%s...）",
        deleted,
        len(target_ids),
        remaining_after,
        thread_id[:8],
    )
    return deleted


async def close_connection_pool():
    """关闭连接池"""
    global _pool
    if _pool is not None and not _pool.closed:
        await _pool.close()
        logger.info("[DB] Connection pool closed")
