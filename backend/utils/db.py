"""
LangGraph 数据库连接工具
提供异步连接池给 AsyncPostgresSaver 使用
"""
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool
import os
from utils.logger import logger

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in environment variables")

# 转换为 psycopg 格式（去掉 +asyncpg 等驱动后缀）
PSYCOPG_DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg", "postgresql").replace("postgresql+psycopg", "postgresql")

# 🔥 HITL 优化：添加 TCP keepalive 参数到连接 URL
# 防止长时间等待（如 HITL 用户确认）时连接被网络设备/数据库关闭
# keepalives_idle: 开始发送 keepalive 前的空闲时间（秒）
# keepalives_interval: keepalive 包发送间隔（秒）  
# keepalives_count: 关闭连接前的失败次数
if "keepalives" not in PSYCOPG_DATABASE_URL:
    separator = "&" if "?" in PSYCOPG_DATABASE_URL else "?"
    PSYCOPG_DATABASE_URL += f"{separator}keepalives=1&keepalives_idle=60&keepalives_interval=30&keepalives_count=3"

async def _configure_connection(conn):
    """配置新连接 - 设置 TCP keepalive 防止长时间等待时断开"""
    # 启用 TCP keepalive (Linux/macOS)
    # keepalives_idle: 开始发送 keepalive 前的空闲时间
    # keepalives_interval: keepalive 包发送间隔
    # keepalives_count: 关闭连接前的失败次数
    try:
        await conn.execute("""
            SET application_name = 'xpouch_ai_langgraph';
        """)
    except Exception:
        pass  # 某些参数可能不受支持


async def _check_connection(conn):
    """连接健康检查 - 确保连接可用"""
    try:
        await conn.execute("SELECT 1")
        return True
    except Exception:
        return False


# 全局连接池（单例模式）
_pool = None


def get_connection_pool() -> AsyncConnectionPool:
    """获取或创建异步连接池
    
    配置优化以支持长时间运行的 HITL (Human-in-the-Loop) 任务：
    - max_idle: 30分钟（支持长时间等待用户确认）
    - max_lifetime: 2小时（支持复杂多步骤任务）
    - configure: 配置 TCP keepalive
    - check: 检查连接健康状态
    """
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            conninfo=PSYCOPG_DATABASE_URL,
            open=False,  # 延迟打开
            min_size=2,
            max_size=10,
            timeout=30,
            # 🔥 HITL 优化：增加空闲时间和生命周期，支持长时间等待
            max_idle=1800,  # 30分钟空闲（默认10分钟太短，HITL等待时连接被关闭）
            max_lifetime=7200,  # 2小时生命周期（默认1小时）
            configure=_configure_connection,  # 配置新连接
            check=_check_connection,  # 连接健康检查
            reconnect_timeout=60,  # 重连超时
        )
    return _pool


async def reset_connection_pool():
    """重置连接池（用于错误恢复）"""
    global _pool
    if _pool is not None:
        try:
            await _pool.close()
        except:
            pass
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
        except:
            pass
        yield conn


async def init_checkpointer_tables():
    """
    初始化 LangGraph Checkpointer 所需的表结构
    注意：表结构已由 fix_checkpoint_table.py 创建，这里仅做检查
    """
    import psycopg
    
    logger.info("[HITL] Checking checkpointer tables...")
    
    try:
        with psycopg.connect(PSYCOPG_DATABASE_URL) as conn:
            with conn.cursor() as cur:
                # 检查所有必需的表
                cur.execute("""
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name LIKE 'checkpoint%'
                """)
                tables = [row[0] for row in cur.fetchall()]
                
                required = ['checkpoints', 'checkpoint_blobs', 'checkpoint_writes', 'checkpoint_migrations']
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
