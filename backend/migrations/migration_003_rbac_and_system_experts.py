"""
Migration 003: RBAC 和系统专家管理表

变更：
1. 在 User 表中添加 role 字段
2. 创建 SystemExpert 表
3. 初始化系统专家数据（从 constants.py 读取）
"""
import sqlite3
import sys
import os

# 添加migrations目录到路径
sys.path.insert(0, os.path.dirname(__file__))

from runner import Migration


def add_column_if_not_exists(conn: sqlite3.Connection, table: str, column: str, definition: str):
    """如果字段不存在则添加"""
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        print(f"  → 添加 {table}.{column}...")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print(f"  → {table}.{column} 已存在，跳过")
        else:
            raise


def create_index_if_not_exists(conn: sqlite3.Connection, index_name: str, table: str, columns: str):
    """如果索引不存在则创建"""
    try:
        conn.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table}({columns})")
        print(f"  → 创建索引 {index_name}...")
    except sqlite3.OperationalError:
        print(f"  → 索引 {index_name} 已存在，跳过")


class Migration003RbacAndSystemExperts(Migration):
    """RBAC 和系统专家管理迁移"""

    version = "003"
    description = "RBAC 和系统专家管理表"

    def up(self, conn: sqlite3.Connection) -> None:
        """执行迁移：添加表和字段"""
        print(f"[Migration {self.version}] 开始执行 RBAC 和专家管理迁移...")

        # 1. 添加 User.role 字段
        print(f"[Migration {self.version}] 添加 User.role 字段...")
        add_column_if_not_exists(
            conn,
            "user",
            "role",
            "VARCHAR(10) DEFAULT 'user' NOT NULL"
        )

        # 2. 创建 SystemExpert 表
        print(f"[Migration {self.version}] 创建 SystemExpert 表...")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS system_expert (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expert_key VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                system_prompt TEXT NOT NULL,
                model VARCHAR(50) DEFAULT 'gpt-4o',
                temperature REAL DEFAULT 0.5,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 3. 创建索引
        create_index_if_not_exists(
            conn,
            "idx_system_expert_key",
            "system_expert",
            "expert_key"
        )

        print(f"[Migration {self.version}] 迁移完成！")

    def down(self, conn: sqlite3.Connection) -> None:
        """回滚迁移：删除表和字段"""
        print(f"[Migration {self.version}] 开始回滚...")

        # 1. 删除 SystemExpert 表
        conn.execute("DROP TABLE IF EXISTS system_expert")

        # 2. 删除 User.role 字段（SQLite 不支持 DROP COLUMN）
        # SQLite 不支持 DROP COLUMN，但可以通过重建表来模拟
        # 这里只打印警告，不实际删除
        print(f"[Migration {self.version}] 警告: SQLite 不支持 DROP COLUMN")
        print(f"[Migration {self.version}] User.role 字段将保留")

        print(f"[Migration {self.version}] 回滚完成！")
