"""
迁移执行脚本

使用方法：
1. 应用所有迁移：    python migrate.py
2. 回滚最新迁移：    python migrate.py --rollback
3. 查看迁移状态：    python migrate.py --status
"""
import sys
import os

# 添加后端目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from migrations.migration_001_architecture_refactoring import Migration001ArchitectureRefactoring
from migrations.migration_002_jwt_auth import Migration002JwtAuth
from migrations.migration_003_rbac_and_system_experts import Migration003RbacAndSystemExperts
from migrations.runner import run_migrations, get_migration_status


def main():
    """主函数"""
    # 定义迁移列表（按版本顺序）
    migrations = [
        Migration001ArchitectureRefactoring(),
        Migration002JwtAuth(),
        Migration003RbacAndSystemExperts(),
    ]

    # 解析命令行参数
    if len(sys.argv) > 1:
        action = sys.argv[1]
    else:
        action = "apply"

    if action == "--rollback" or action == "-r":
        # 回滚最新迁移
        print("=" * 60)
        print("回滚最新迁移")
        print("=" * 60)
        run_migrations(migrations, rollback=True)
    elif action == "--status" or action == "-s":
        # 查看迁移状态
        print("=" * 60)
        print("迁移状态")
        print("=" * 60)

        status = get_migration_status()

        if not status:
            print("没有已应用的迁移")
        else:
            print(f"{'版本':<10} {'描述':<40} {'应用时间'}")
            print("-" * 60)
            for item in status:
                print(f"{item['version']:<10} {item['description']:<40} {item['applied_at'][:19]}")

        # 显示未应用的迁移
        applied_versions = {item['version'] for item in status}
        print("\n待应用迁移:")
        print("-" * 60)
        for migration in migrations:
            if migration.version not in applied_versions:
                print(f"{migration.version:<10} {migration.description}")
    elif action == "--help" or action == "-h":
        # 显示帮助
        print("""
数据库迁移工具

使用方法：
  python migrate.py                  应用所有待执行的迁移
  python migrate.py --rollback       回滚最新迁移
  python migrate.py --status         查看迁移状态
  python migrate.py --help           显示此帮助信息

说明：
  - 迁移脚本位于 migrations/ 目录
  - 迁移记录存储在数据库的 __migrations__ 表
  - SQLite 不支持 DROP COLUMN，回滚只能删除索引
        """)
    else:
        # 应用迁移
        print("=" * 60)
        print("执行数据库迁移")
        print("=" * 60)
        run_migrations(migrations, rollback=False)

    print("\n完成！")


if __name__ == "__main__":
    main()
