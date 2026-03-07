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

from config import settings

# Import all models to ensure metadata includes all tables

# Alembic Config object
config = context.config

# Setup logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

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
