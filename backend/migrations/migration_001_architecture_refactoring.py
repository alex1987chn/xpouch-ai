"""
架构重构迁移脚本 (v001)

变更内容：
1. Conversation表：
   - 新增 agent_type 字段（会话类型：default/custom/ai）
   - 新增 agent_id 字段（关联的智能体ID）
   - 新增 task_session_id 字段（关联的任务会话ID）

2. CustomAgent表：
   - 新增 is_default 字段（标识默认助手）

3. SubTask表：
   - 新增 artifacts 字段（存储专家交付物）

4. TaskSession表：
   - 新增 conversation_id 字段（关联的会话ID）

创建日期：2026-01-22
作者：XPouch AI Team
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


class Migration001ArchitectureRefactoring(Migration):
    """架构重构迁移 - v001"""

    version = "001"
    description = "架构重构：添加会话类型、默认助手、Artifacts支持"

    def up(self, conn: sqlite3.Connection):
        """执行迁移"""

        # 1. Conversation表新增字段
        add_column_if_not_exists(conn, "conversation", "agent_type", "VARCHAR(20) DEFAULT 'default'")
        add_column_if_not_exists(conn, "conversation", "agent_id", "VARCHAR(100)")
        add_column_if_not_exists(conn, "conversation", "task_session_id", "VARCHAR(100)")

        # 2. 为Conversation表添加索引
        create_index_if_not_exists(conn, "ix_conversation_agent_type", "conversation", "agent_type")
        create_index_if_not_exists(conn, "ix_conversation_agent_id", "conversation", "agent_id")
        create_index_if_not_exists(conn, "ix_conversation_task_session_id", "conversation", "task_session_id")

        # 3. CustomAgent表新增字段
        add_column_if_not_exists(conn, "customagent", "is_default", "BOOLEAN DEFAULT 0")

        # 4. 为CustomAgent表添加索引
        create_index_if_not_exists(conn, "ix_customagent_is_default", "customagent", "is_default")

        # 5. SubTask表新增字段
        add_column_if_not_exists(conn, "subtask", "artifacts", "JSON")

        # 6. TaskSession表新增字段
        add_column_if_not_exists(conn, "tasksession", "conversation_id", "VARCHAR(100)")

        # 7. 为TaskSession表添加索引
        create_index_if_not_exists(conn, "ix_tasksession_conversation_id", "tasksession", "conversation_id")

        # 8. 数据迁移：为现有Conversation记录设置默认值（如果agent_id为空）
        print("  → 迁移现有 Conversation 数据...")
        conn.execute("""
            UPDATE conversation
            SET agent_id = id,
                agent_type = 'custom'
            WHERE agent_id IS NULL OR agent_id = ''
        """)

        print("所有字段添加完成")

    def down(self, conn: sqlite3.Connection):
        """回滚迁移"""
        # 注意：SQLite 不支持 DROP COLUMN，回滚只能删除索引
        print("  → 删除 conversation 索引...")
        conn.execute("DROP INDEX IF EXISTS ix_conversation_agent_type")
        conn.execute("DROP INDEX IF EXISTS ix_conversation_agent_id")
        conn.execute("DROP INDEX IF EXISTS ix_conversation_task_session_id")

        print("  → 删除 customagent 索引...")
        conn.execute("DROP INDEX IF EXISTS ix_customagent_is_default")

        print("  → 删除 tasksession 索引...")
        conn.execute("DROP INDEX IF EXISTS ix_tasksession_conversation_id")

        print("注意：SQLite 不支持 DROP COLUMN，添加的列将被保留")
