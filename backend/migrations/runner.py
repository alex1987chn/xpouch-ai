"""
数据库迁移工具

提供迁移版本管理、执行和回滚功能。
"""
import sqlite3
import os
from typing import List, Optional
from datetime import datetime

# 数据库路径
DB_PATH = "data/database.db"
MIGRATIONS_TABLE = "__migrations__"


class Migration:
    """迁移基类"""

    version: str
    description: str
    applied_at: Optional[datetime] = None

    def up(self, conn: sqlite3.Connection):
        """执行迁移"""
        raise NotImplementedError

    def down(self, conn: sqlite3.Connection):
        """回滚迁移"""
        raise NotImplementedError


def ensure_migrations_table(conn: sqlite3.Connection):
    """确保迁移表存在"""
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {MIGRATIONS_TABLE} (
            version TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
    """)


def get_applied_migrations(conn: sqlite3.Connection) -> List[str]:
    """获取已应用的迁移版本"""
    cursor = conn.execute(f"SELECT version FROM {MIGRATIONS_TABLE} ORDER BY version")
    return [row[0] for row in cursor.fetchall()]


def record_migration(conn: sqlite3.Connection, version: str, description: str):
    """记录已应用的迁移"""
    conn.execute(
        f"INSERT INTO {MIGRATIONS_TABLE} (version, description, applied_at) VALUES (?, ?, ?)",
        (version, description, datetime.now().isoformat())
    )


def remove_migration_record(conn: sqlite3.Connection, version: str):
    """删除迁移记录"""
    conn.execute(f"DELETE FROM {MIGRATIONS_TABLE} WHERE version = ?", (version,))


def run_migrations(migrations: List[Migration], rollback: bool = False):
    """
    运行迁移或回滚

    Args:
        migrations: 迁移对象列表（按版本顺序）
        rollback: 是否回滚最新迁移
    """
    if not os.path.exists(DB_PATH):
        print(f"数据库文件不存在: {DB_PATH}")
        print("提示: 请先运行 python database.py 创建数据库")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_migrations_table(conn)

        if rollback:
            # 回滚最新迁移
            applied = get_applied_migrations(conn)
            if not applied:
                print("没有已应用的迁移，无法回滚")
                return

            latest_version = applied[-1]
            latest_migration = next((m for m in migrations if m.version == latest_version), None)

            if latest_migration:
                print(f"回滚迁移 {latest_version}: {latest_migration.description}")
                latest_migration.down(conn)
                remove_migration_record(conn, latest_version)
                conn.commit()
                print(f"✓ 回滚成功")
            else:
                print(f"未找到迁移 {latest_version} 的定义")
        else:
            # 应用新迁移
            applied = get_applied_migrations(conn)
            applied_set = set(applied)

            for migration in migrations:
                if migration.version in applied_set:
                    print(f"⊘ 跳过已应用的迁移 {migration.version}: {migration.description}")
                    continue

                print(f"应用迁移 {migration.version}: {migration.description}")
                migration.up(conn)
                record_migration(conn, migration.version, migration.description)
                conn.commit()
                print(f"✓ 迁移成功")

    finally:
        conn.close()


def get_migration_status() -> List[dict]:
    """获取迁移状态"""
    if not os.path.exists(DB_PATH):
        return []

    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_migrations_table(conn)
        cursor = conn.execute(
            f"SELECT version, description, applied_at FROM {MIGRATIONS_TABLE} ORDER BY version"
        )
        return [
            {
                "version": row[0],
                "description": row[1],
                "applied_at": row[2]
            }
            for row in cursor.fetchall()
        ]
    finally:
        conn.close()
