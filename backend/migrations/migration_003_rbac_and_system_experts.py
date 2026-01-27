"""
Migration 003: RBAC 和系统专家管理表

变更：
1. 在 User 表中添加 role 字段
2. 创建 SystemExpert 表
3. 初始化系统专家数据（从 constants.py 读取）
"""

from datetime import datetime
from typing import Any
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, text
from sqlalchemy.sql import table, column


def up(conn: Any) -> None:
    """执行迁移：添加表和字段"""
    print("[Migration 003] 开始执行 RBAC 和专家管理迁移...")

    # 1. 添加 User.role 字段
    print("[Migration 003] 添加 User.role 字段...")
    conn.execute(text("""
        ALTER TABLE "user"
        ADD COLUMN role VARCHAR(10) DEFAULT 'user' NOT NULL
    """))

    # 2. 创建 SystemExpert 表
    print("[Migration 003] 创建 SystemExpert 表...")
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS system_expert (
            id SERIAL PRIMARY KEY,
            expert_key VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            system_prompt TEXT NOT NULL,
            model VARCHAR(50) DEFAULT 'gpt-4o',
            temperature FLOAT DEFAULT 0.5,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    # 3. 创建索引
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_system_expert_key
        ON system_expert (expert_key)
    """))

    print("[Migration 003] 迁移完成！")


def down(conn: Any) -> None:
    """回滚迁移：删除表和字段"""
    print("[Migration 003] 开始回滚...")

    # 1. 删除 SystemExpert 表
    conn.execute(text("DROP TABLE IF EXISTS system_expert"))

    # 2. 删除 User.role 字段
    conn.execute(text("""
        ALTER TABLE "user"
        DROP COLUMN IF EXISTS role
    """))

    print("[Migration 003] 回滚完成！")
