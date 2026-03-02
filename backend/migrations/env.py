from logging.config import fileConfig
import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine, pool
from alembic import context

# Import SQLModel and all models
from sqlmodel import SQLModel
# Import all models to ensure metadata includes all tables
from models import (
    User, Thread, Message, CustomAgent, TaskSession, 
    SubTask, Artifact, SystemExpert, UserMemory
)

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
    
    # Convert asyncpg/psycopg URL to standard PostgreSQL URL
    # Alembic uses synchronous connection
    url = database_url.replace("+asyncpg", "").replace("+psycopg", "")
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
