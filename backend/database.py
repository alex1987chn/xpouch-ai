from sqlmodel import SQLModel, create_engine, Session
from models import Thread, Message, User, CustomAgent, SystemExpert, SubTask, TaskSession
import os
from dotenv import load_dotenv
from pathlib import Path

# 加载环境变量
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

# 使用环境变量中的数据库URL
DATABASE_URL = os.getenv("DATABASE_URL")

# 验证数据库URL
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in environment variables")

# 只支持 PostgreSQL
if not (DATABASE_URL.startswith("postgresql") or DATABASE_URL.startswith("postgres")):
    raise ValueError(f"Only PostgreSQL is supported. Got: {DATABASE_URL}")

# PostgreSQL配置
engine = create_engine(DATABASE_URL, echo=False)
print(f"[Database] Using PostgreSQL: {DATABASE_URL}")

def create_db_and_tables():
    """创建数据库表"""
    # PostgreSQL 使用 SQLModel 自动创建表
    print("[Database] Creating database tables...")
    SQLModel.metadata.create_all(engine)
    print("[Database] Tables created successfully")

def get_session():
    with Session(engine) as session:
        yield session
