"""
修复 checkpoints 表结构 - 完整版
根据 langgraph-checkpoint-postgres 的 MIGRATIONS 创建所有表
"""
import sys
import os
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not set")

PSYCOPG_DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg", "postgresql").replace("postgresql+psycopg", "postgresql")

# 完整的迁移 SQL（来自 langgraph-checkpoint-postgres）
MIGRATIONS = [
    # Migration 0: 迁移记录表
    """
    CREATE TABLE IF NOT EXISTS checkpoint_migrations (
        v INTEGER PRIMARY KEY
    )
    """,
    
    # Migration 1: checkpoints 主表
    """
    CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
    )
    """,
    
    # Migration 2: checkpoint_blobs 表
    """
    CREATE TABLE IF NOT EXISTS checkpoint_blobs (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL,
        version TEXT NOT NULL,
        type TEXT NOT NULL,
        blob BYTEA,
        PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
    )
    """,
    
    # Migration 3: checkpoint_writes 表（初始版本）
    """
    CREATE TABLE IF NOT EXISTS checkpoint_writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        blob BYTEA NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
    )
    """,
    
    # Migration 4: 修改 blob 列为 nullable
    """
    ALTER TABLE checkpoint_blobs ALTER COLUMN blob DROP NOT NULL
    """,
    
    # Migration 5: 占位
    "SELECT 1",
    
    # Migration 6: checkpoints 索引
    """
    CREATE INDEX IF NOT EXISTS checkpoints_thread_id_idx ON checkpoints(thread_id)
    """,
    
    # Migration 7: checkpoint_blobs 索引
    """
    CREATE INDEX IF NOT EXISTS checkpoint_blobs_thread_id_idx ON checkpoint_blobs(thread_id)
    """,
    
    # Migration 8: checkpoint_writes 索引
    """
    CREATE INDEX IF NOT EXISTS checkpoint_writes_thread_id_idx ON checkpoint_writes(thread_id)
    """,
    
    # Migration 9: 添加 task_path 列
    """
    ALTER TABLE checkpoint_writes ADD COLUMN IF NOT EXISTS task_path TEXT NOT NULL DEFAULT ''
    """,
]


def fix_checkpoint_tables():
    """创建完整的表结构"""
    import psycopg
    
    print("[Fix] Connecting to database...")
    
    with psycopg.connect(PSYCOPG_DATABASE_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            # 删除旧表（如果存在）
            print("[Fix] Dropping old tables...")
            cur.execute("DROP TABLE IF EXISTS checkpoint_writes CASCADE")
            cur.execute("DROP TABLE IF EXISTS checkpoint_blobs CASCADE")
            cur.execute("DROP TABLE IF EXISTS checkpoints CASCADE")
            cur.execute("DROP TABLE IF EXISTS checkpoint_migrations CASCADE")
            print("[Fix] Old tables dropped")
            
            # 执行所有迁移
            print("[Fix] Creating tables...")
            for i, migration in enumerate(MIGRATIONS):
                try:
                    cur.execute(migration)
                    print(f"[Fix] Migration {i} applied")
                except Exception as e:
                    print(f"[Fix] Migration {i} skipped: {e}")
            
            # 插入迁移版本记录
            cur.execute("INSERT INTO checkpoint_migrations (v) VALUES (0)")
            for v in range(1, len(MIGRATIONS)):
                cur.execute("INSERT INTO checkpoint_migrations (v) VALUES (%s)", (v,))
            
            print("[Fix] All tables created successfully!")
            
            # 验证表结构
            print("[Fix] Verifying tables...")
            cur.execute("""
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name LIKE 'checkpoint%'
            """)
            tables = [row[0] for row in cur.fetchall()]
            print(f"[Fix] Tables: {tables}")
            
            # 验证 checkpoint_writes 列
            cur.execute("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'checkpoint_writes'
            """)
            columns = [row[0] for row in cur.fetchall()]
            print(f"[Fix] checkpoint_writes columns: {columns}")


if __name__ == "__main__":
    try:
        fix_checkpoint_tables()
        print("\n[OK] All checkpoint tables fixed!")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
