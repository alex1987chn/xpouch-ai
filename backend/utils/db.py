"""
LangGraph 数据库连接工具
提供异步连接池给 AsyncPostgresSaver 使用
"""
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool
import os

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in environment variables")

# 转换为 psycopg 格式（去掉 +asyncpg 等驱动后缀）
PSYCOPG_DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg", "postgresql").replace("postgresql+psycopg", "postgresql")

# 全局连接池（单例模式）
_pool = None


def get_connection_pool() -> AsyncConnectionPool:
    """获取或创建异步连接池"""
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            conninfo=PSYCOPG_DATABASE_URL,
            open=False,  # 延迟打开
            min_size=2,
            max_size=10,
            timeout=30,
            max_idle=300,
            max_lifetime=3600,
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
        print("[DB] Connection pool reset")


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
    
    print("[HITL] Checking checkpointer tables...")
    
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
                    print(f"[HITL WARN] Missing tables: {missing}")
                    print("[HITL] Please run: uv run python fix_checkpoint_table.py")
                else:
                    print("[HITL] All checkpointer tables exist")
                    
    except Exception as e:
        print(f"[HITL WARN] Failed to check tables: {e}")


async def close_connection_pool():
    """关闭连接池"""
    global _pool
    if _pool is not None and not _pool.closed:
        await _pool.close()
        print("[DB] Connection pool closed")
