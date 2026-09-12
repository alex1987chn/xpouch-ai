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
    """启动时 schema 对齐——所有环境统一走 Alembic（单一真相源）。

    create_all 已退役：开发/生产双真相源并存时，create_all 会静默补表，
    掩盖"库缺迁移"的事实（如 last_login_at 事故）。缺迁移即失败并提示。
    """
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    ini_path = Path(__file__).parent / "alembic.ini"
    alembic_cfg = Config(str(ini_path))
    # script_location 以 ini 所在目录为基准，避免工作目录差异
    alembic_cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    command.upgrade(alembic_cfg, "head")
    logger.info("[Database] schema aligned via Alembic (upgrade head)")


def get_session():
    with Session(engine) as session:
        yield session
