from sqlmodel import Session, SQLModel, create_engine

from config import settings
from utils.logger import logger

# 🔥 用于非依赖注入场景的 Session 别名
SQLModelSession = Session

DATABASE_URL = settings.get_database_url(sync_driver="psycopg")

# PostgreSQL配置 - 优化连接池以适配 4 个 Gunicorn Workers
engine = create_engine(
    DATABASE_URL,
    echo=False,
    # 🔥 连接池大小 (配合 Gunicorn 4 workers，建议设大一点)
    pool_size=20,
    # 允许临时溢出的连接数
    max_overflow=10,
    # 🔥 每 300秒 (5分钟) 回收连接，防止云数据库 idle timeout 导致的"死链接"
    # 云环境通常 600s 开始清理，我们主动在 300s 时"转生"，确保连接永远"壮年"
    pool_recycle=300,
    # 🔥 每次取连接前 ping 一下，确保连接活着 (虽然有一点点性能损耗，但极其稳定)
    pool_pre_ping=True,
)
logger.info("[Database] Using PostgreSQL: %s", settings.get_masked_database_url())
logger.info(
    "[Database] Connection pool: size=20, max_overflow=10, pool_recycle=300s, pool_pre_ping=True"
)


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
