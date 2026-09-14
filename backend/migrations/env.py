import os
import sys
from logging.config import fileConfig
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from dotenv import load_dotenv

# Load environment variables for Alembic commands.
# Prefer backend/.env, then fallback to repo root .env
backend_dir = Path(__file__).resolve().parents[1]
repo_root = backend_dir.parent
load_dotenv(backend_dir / ".env", override=False)
load_dotenv(repo_root / ".env", override=False)

from alembic import context
from sqlalchemy import create_engine, pool

# Import SQLModel and all models
from sqlmodel import SQLModel

# Import all models to ensure metadata includes all tables
# （评审 M1 补上的缺失导入：此前注释宣称导入全部模型，实际一条都没导——
#   target_metadata 是空 metadata，autogenerate/check 会生成「删光所有表」。
#   幸而迁移全部手写才没有爆发。models/__init__ 是表模型的权威注册处。）
import models  # noqa: F401  # noqa: E402
from config import settings

# Alembic Config object
config = context.config

# Setup logging
#
# 只在**尚未配置日志**时套用 alembic.ini（CLI 场景：`alembic upgrade head`）。
# 进程内迁移（应用启动时 create_db_and_tables → command.upgrade）必须跳过，
# 否则会破坏应用日志：
#   logging.config.fileConfig 会**无条件**调用 _clearExistingHandlers()，把
#   utils/logger.setup_logging() 配好的 root handler 全部清掉，再按 alembic.ini
#   的 [logger_root] level=WARNING 重建 —— 结果是启动后应用的 INFO 日志全部
#   消失（ERROR 仍走 stderr，故"部分可见"更有迷惑性）。
#   v3.5.0 曾因此让生产 500 难以定位；当时只修了 disable_existing_loggers，
#   但该参数**并不阻止 handler 被清除**（遗留问题，2026-09-13 修正）。
# 判据用 setup_logging() 打在 root logger 上的幂等标记，最精确。
import logging as _logging

_app_logging_configured = bool(getattr(_logging.getLogger(), "_xpouch_logging_configured", False))
if config.config_file_name is not None and not _app_logging_configured:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# SQLModel metadata
target_metadata = SQLModel.metadata


def get_database_url():
    """使用统一配置获取 Alembic 所需的同步数据库连接串。"""
    return settings.get_database_url(sync_driver="psycopg")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    url = get_database_url()
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
