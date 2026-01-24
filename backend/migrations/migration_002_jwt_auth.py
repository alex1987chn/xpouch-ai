"""
JWT认证迁移脚本 (v002)

变更内容：
1. User表：
   - 新增 phone_number 字段（手机号码）
   - 新增 email 字段（邮箱）
   - 新增 password_hash 字段（密码哈希）
   - 新增 verification_code 字段（验证码）
   - 新增 verification_code_expires_at 字段（验证码过期时间）
   - 新增 auth_provider 字段（认证提供者：phone/email/github/google/wechat）
   - 新增 provider_id 字段（第三方登录的用户ID）
   - 新增 access_token 字段（JWT访问令牌）
   - 新增 refresh_token 字段（刷新令牌）
   - 新增 token_expires_at 字段（令牌过期时间）
   - 新增 is_verified 字段（是否已验证）

创建日期：2026-01-24
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


def create_index_if_not_exists(conn: sqlite3.Connection, index_name: str, table: str, columns: str, unique: bool = False):
    """如果索引不存在则创建"""
    try:
        unique_str = "UNIQUE " if unique else ""
        conn.execute(f"CREATE {unique_str}INDEX IF NOT EXISTS {index_name} ON {table}({columns})")
        print(f"  → 创建{'唯一' if unique else ''}索引 {index_name}...")
    except sqlite3.OperationalError:
        print(f"  → 索引 {index_name} 已存在，跳过")


class Migration002JwtAuth(Migration):
    """JWT认证迁移 - v002"""

    version = "002"
    description = "JWT认证：添加用户认证相关字段"

    def up(self, conn: sqlite3.Connection):
        """执行迁移"""

        # 1. User表新增字段 - 基础认证字段（先不添加 UNIQUE 约束）
        add_column_if_not_exists(conn, "user", "phone_number", "VARCHAR(20)")
        add_column_if_not_exists(conn, "user", "email", "VARCHAR(255)")
        add_column_if_not_exists(conn, "user", "password_hash", "VARCHAR(255)")

        # 2. User表新增字段 - 验证码相关
        add_column_if_not_exists(conn, "user", "verification_code", "VARCHAR(10)")
        add_column_if_not_exists(conn, "user", "verification_code_expires_at", "DATETIME")

        # 3. User表新增字段 - 认证提供者
        add_column_if_not_exists(conn, "user", "auth_provider", "VARCHAR(20)")
        add_column_if_not_exists(conn, "user", "provider_id", "VARCHAR(255)")

        # 4. User表新增字段 - JWT令牌
        add_column_if_not_exists(conn, "user", "access_token", "VARCHAR(500)")
        add_column_if_not_exists(conn, "user", "refresh_token", "VARCHAR(500)")
        add_column_if_not_exists(conn, "user", "token_expires_at", "DATETIME")

        # 5. User表新增字段 - 验证状态
        add_column_if_not_exists(conn, "user", "is_verified", "BOOLEAN DEFAULT 0")

        # 6. 为User表添加唯一索引（替代列级的 UNIQUE 约束）
        create_index_if_not_exists(conn, "ix_user_phone_number", "user", "phone_number", unique=True)
        create_index_if_not_exists(conn, "ix_user_email", "user", "email", unique=True)
        create_index_if_not_exists(conn, "ix_user_provider_id", "user", "provider_id", unique=True)
        create_index_if_not_exists(conn, "ix_user_auth_provider", "user", "auth_provider")

        print("所有认证字段添加完成")

    def down(self, conn: sqlite3.Connection):
        """回滚迁移"""
        # 注意：SQLite 不支持 DROP COLUMN，回滚只能删除索引
        print("  → 删除 user 索引...")
        conn.execute("DROP INDEX IF EXISTS ix_user_phone_number")
        conn.execute("DROP INDEX IF EXISTS ix_user_email")
        conn.execute("DROP INDEX IF EXISTS ix_user_provider_id")
        conn.execute("DROP INDEX IF EXISTS ix_user_auth_provider")

        print("注意：SQLite 不支持 DROP COLUMN，添加的列将被保留")
