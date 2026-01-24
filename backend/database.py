from sqlmodel import SQLModel, create_engine, Session
from models import Conversation, Message, User, CustomAgent
import os
import sqlite3

# 确保 data 目录存在
os.makedirs("data", exist_ok=True)

# 生产环境建议使用 Docker 挂载目录
sqlite_file_name = "data/database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)

def create_db_and_tables():
    """创建数据库表并运行迁移"""
    # 1. 创建所有表（如果不存在）
    SQLModel.metadata.create_all(engine)

    # 2. 运行数据库迁移
    run_migrations()

def run_migrations():
    """运行所有待执行的迁移"""
    import sys
    import importlib

    # 添加 migrations 目录到路径
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
    sys.path.insert(0, migrations_dir)

    # 导入并执行迁移
    try:
        from migration_001_architecture_refactoring import Migration001ArchitectureRefactoring

        # 检查迁移是否已执行（通过检查表结构）
        with sqlite3.connect(sqlite_file_name) as conn:
            cursor = conn.cursor()

            # 检查 agent_type 列是否存在（Migration001 的标志）
            cursor.execute("PRAGMA table_info(conversation)")
            columns = [row[1] for row in cursor.fetchall()]

            if "agent_type" not in columns:
                print("[Database] Running Migration001: Architecture Refactoring...")
                migration = Migration001ArchitectureRefactoring()
                migration.up(conn)
                print("[Database] Migration001 completed")
            else:
                print("[Database] Migration001 already applied, skipping")

            conn.commit()

    except ImportError as e:
        print(f"[Database] Warning: Failed to import migration: {e}")
    except Exception as e:
        print(f"[Database] Error running migration: {e}")
        raise

def get_session():
    with Session(engine) as session:
        yield session
