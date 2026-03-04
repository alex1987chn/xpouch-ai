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

# Alembic Config object
config = context.config

# Setup logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# SQLModel metadata
target_metadata = SQLModel.metadata


def get_database_url():
    """Get database URL from environment variable"""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError(
            "DATABASE_URL environment variable is not set. "
            "Please set it in your .env file or environment."
        )

    # Convert asyncpg URL to psycopg (sync) for Alembic
    # psycopg (v3) is already installed and supports sync mode
    url = database_url.replace("+asyncpg", "+psycopg")
    return url


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
