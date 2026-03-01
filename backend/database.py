from sqlmodel import SQLModel, create_engine, Session
from utils.logger import logger

# 🔥 用于非依赖注入场景的 Session 别名
SQLModelSession = Session
# 🔥 从 models 包导入所有模型（包括 UserMemory）
from models import (
    Thread, Message, User, CustomAgent, SystemExpert,
    SubTask, TaskSession, UserMemory
)
from models.mcp import MCPServer  # 🔥 MCP 服务器模型
import os

# 使用环境变量中的数据库URL
DATABASE_URL = os.getenv("DATABASE_URL")

# 验证数据库URL
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in environment variables")

# 只支持 PostgreSQL
if not (DATABASE_URL.startswith("postgresql") or DATABASE_URL.startswith("postgres")):
    raise ValueError(f"Only PostgreSQL is supported. Got: {DATABASE_URL}")

# PostgreSQL配置 - 优化连接池以适配 4 个 Gunicorn Workers
engine = create_engine(
    DATABASE_URL,
    echo=False,
    # 🔥 连接池大小 (配合 Gunicorn 4 workers，建议设大一点)
    pool_size=20,
    # 允许临时溢出的连接数
    max_overflow=10,
    # 🔥 每 1800秒 (30分钟) 回收连接，防止数据库端断开导致的"死链接"
    pool_recycle=1800,
    # 🔥 每次取连接前 ping 一下，确保连接活着 (虽然有一点点性能损耗，但极其稳定)
    pool_pre_ping=True
)
logger.info(f"[Database] Using PostgreSQL: {DATABASE_URL}")
logger.info(f"[Database] Connection pool: size=20, max_overflow=10, pool_recycle=1800s, pool_pre_ping=True")

def create_db_and_tables():
    """创建数据库表（如果不存在）"""
    # PostgreSQL 使用 SQLModel 自动创建表
    # checkfirst=True 是默认值：表存在则不操作，不存在则创建
    logger.info("[Database] Checking database tables...")
    SQLModel.metadata.create_all(engine, checkfirst=True)
    logger.info("[Database] Database tables ready")

def get_session():
    with Session(engine) as session:
        yield session
