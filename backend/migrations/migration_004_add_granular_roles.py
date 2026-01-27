"""
Migration 004: 添加细粒度管理员角色

新增角色：
- VIEW_ADMIN: 只查看专家配置
- EDIT_ADMIN: 可修改专家配置

现有角色：
- USER: 普通用户
- ADMIN: 完全管理员
"""

import sys
import pathlib
from sqlalchemy import text
from database import engine
from config import print_success, print_info

sys.path.append(str(pathlib.Path(__file__).parent.parent))


class Migration004GranularRoles:
    """
    Migration 004: 添加细粒度管理员角色
    """

    def __init__(self):
        self.version = "004"
        self.description = "添加细粒度管理员角色（VIEW_ADMIN, EDIT_ADMIN）"

    def up(self):
        """
        执行迁移：添加新的角色类型
        """
        print_info(f"Applying {self.version}: {self.description}")

        # 由于 PostgreSQL 的 ENUM 修改需要特殊处理
        # 我们需要先删除旧的 ENUM 类型，然后创建新的
        with engine.connect() as conn:
            # 1. 修改列允许新值（临时允许所有字符串）
            conn.execute(text("""
                ALTER TABLE "user"
                ALTER COLUMN role TYPE VARCHAR(20);
            """))

            # 2. 提交更改
            conn.commit()

            # 3. 创建新的 ENUM 类型
            conn.execute(text("""
                DO $$
                BEGIN;
                    DROP TYPE IF EXISTS userrole;
                    CREATE TYPE userrole AS ENUM ('user', 'admin', 'view_admin', 'edit_admin');
                COMMIT;
                $$ LANGUAGE plpgsql;
            """))

            # 4. 修改列使用新的 ENUM 类型
            conn.execute(text("""
                ALTER TABLE "user"
                ALTER COLUMN role TYPE userrole USING role::userrole;
            """))

            # 5. 添加默认值约束（可选）
            conn.execute(text("""
                ALTER TABLE "user"
                ALTER COLUMN role SET DEFAULT 'user';
            """))

            # 6. 提交更改
            conn.commit()

        print_success(f"Migration {self.version} completed successfully")
        print_info(f"New roles added: VIEW_ADMIN, EDIT_ADMIN")

    def down(self):
        """
        回滚迁移：删除新角色，恢复为基本角色
        """
        print_info(f"Rolling back {self.version}: {self.description}")

        with engine.connect() as conn:
            # 1. 将 VIEW_ADMIN 和 EDIT_ADMIN 用户降级为 USER
            conn.execute(text("""
                UPDATE "user"
                SET role = 'user'
                WHERE role IN ('view_admin', 'edit_admin');
            """))

            # 2. 修改列为 VARCHAR
            conn.execute(text("""
                ALTER TABLE "user"
                ALTER COLUMN role TYPE VARCHAR(20);
            """))

            conn.commit()

            # 3. 重建 ENUM 类型（仅保留 user, admin）
            conn.execute(text("""
                DO $$
                BEGIN;
                    DROP TYPE IF EXISTS userrole;
                    CREATE TYPE userrole AS ENUM ('user', 'admin');
                COMMIT;
                $$ LANGUAGE plpgsql;
            """))

            # 4. 修改列使用新的 ENUM 类型
            conn.execute(text("""
                ALTER TABLE "user"
                ALTER COLUMN role TYPE userrole USING role::userrole;
            """))

            conn.commit()

        print_success(f"Migration {self.version} rolled back successfully")
        print_info(f"Roles removed: VIEW_ADMIN, EDIT_ADMIN")
