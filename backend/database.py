from sqlmodel import SQLModel, create_engine, Session
from models import Conversation, Message, User, CustomAgent
import os
import sqlite3
from dotenv import load_dotenv
from pathlib import Path

# 加载环境变量
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

# 使用环境变量中的数据库URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/database.db")

# 判断数据库类型
if DATABASE_URL.startswith("postgresql") or DATABASE_URL.startswith("postgres"):
    # PostgreSQL配置
    engine = create_engine(DATABASE_URL, echo=False)
    print(f"[Database] Using PostgreSQL: {DATABASE_URL}")
elif DATABASE_URL.startswith("sqlite"):
    # SQLite配置（用于fallback）
    sqlite_file_name = DATABASE_URL.replace("sqlite:///", "")
    connect_args = {"check_same_thread": False}
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
    print(f"[Database] Using SQLite: {DATABASE_URL}")
else:
    raise ValueError(f"Unsupported database URL: {DATABASE_URL}")

def create_db_and_tables():
    """创建数据库表并运行迁移"""
    # 1. 创建所有表（如果不存在）
    SQLModel.metadata.create_all(engine)

    # 2. 运行数据库迁移
    run_migrations()

def run_migrations():
    """运行所有待执行的迁移（支持SQLite和PostgreSQL）"""
    # 检查是否是PostgreSQL
    is_postgresql = DATABASE_URL.startswith("postgresql") or DATABASE_URL.startswith("postgres")

    if is_postgresql:
        # PostgreSQL: 使用迁移脚本系统
        print("[Database] PostgreSQL detected, using migration script system")
        try:
            from migrations.migrate import run_migrations as run_postgres_migrations
            from migrations.migration_001_architecture_refactoring import Migration001ArchitectureRefactoring

            migrations = [Migration001ArchitectureRefactoring()]
            run_postgres_migrations(migrations, rollback=False)
            print("[Database] PostgreSQL migrations completed")
        except Exception as e:
            print(f"[Database] Error running PostgreSQL migrations: {e}")
    else:
        # SQLite: 使用原有的迁移逻辑
        print("[Database] SQLite detected, using legacy migration system")
        try:
            import sys
            import importlib

            # 添加 migrations 目录到路径
            migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
            sys.path.insert(0, migrations_dir)

            # 导入并执行迁移
            from migration_001_architecture_refactoring import Migration001ArchitectureRefactoring
            from migration_002_jwt_auth import Migration002JwtAuth

            # 检查迁移是否已执行（通过检查表结构）
            with sqlite3.connect(sqlite_file_name) as conn:
                cursor = conn.cursor()

                # ===== Migration001: 架构重构 =====
                cursor.execute("PRAGMA table_info(conversation)")
                conversation_columns = [row[1] for row in cursor.fetchall()]

                cursor.execute("PRAGMA table_info(customagent)")
                customagent_columns = [row[1] for row in cursor.fetchall()]

                print(f"[Database] Conversation columns: {conversation_columns}")
                print(f"[Database] CustomAgent columns: {customagent_columns}")

                # 如果 agent_type 存在但 is_default 不存在，说明迁移只执行了一半
                if "agent_type" in conversation_columns and "is_default" not in customagent_columns:
                    print("[Database] Migration001 partially applied (missing is_default column)...")
                    print("[Database] Re-running Migration001 to add missing columns...")
                    migration = Migration001ArchitectureRefactoring()
                    migration.up(conn)
                    print("[Database] Migration001 re-completed")
                elif "agent_type" not in conversation_columns:
                    print("[Database] Running Migration001: Architecture Refactoring...")
                    migration = Migration001ArchitectureRefactoring()
                    migration.up(conn)
                    print("[Database] Migration001 completed")
                else:
                    print("[Database] Migration001 already applied, skipping")

                # ===== Migration002: JWT认证 =====
                cursor.execute("PRAGMA table_info(user)")
                user_columns = [row[1] for row in cursor.fetchall()]

                print(f"[Database] User columns: {user_columns}")

                # 检查 phone_number 是否存在作为Migration002的标志
                if "phone_number" not in user_columns:
                    print("[Database] Running Migration002: JWT Authentication...")
                    migration = Migration002JwtAuth()
                    migration.up(conn)
                    print("[Database] Migration002 completed")
                else:
                    print("[Database] Migration002 already applied, skipping")

                conn.commit()

        except ImportError as e:
            print(f"[Database] Warning: Failed to import migration: {e}")
        except Exception as e:
            print(f"[Database] Error running migration: {e}")
            raise

def get_session():
    with Session(engine) as session:
        yield session
