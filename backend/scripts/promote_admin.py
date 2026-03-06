"""
管理员权限管理脚本

用法：
    # 通过邮箱提升用户为管理员
    uv run python scripts/promote_admin.py admin@example.com

    # 通过手机号提升用户为管理员（纯数字，不带+86）
    uv run python scripts/promote_admin.py 13800138000 --phone

    # 列出所有管理员
    uv run python scripts/promote_admin.py --list

    # 降级管理员为普通用户
    uv run python scripts/promote_admin.py admin@example.com --demote
"""

import argparse
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select

from database import engine
from models import User, UserRole
from utils.logger import logger


def promote_user(identifier: str, is_phone: bool = False) -> None:
    """提升用户为管理员"""
    with Session(engine) as session:
        # 查找用户
        if is_phone:
            user = session.exec(select(User).where(User.phone_number == identifier)).first()
            identifier_type = "手机号"
        else:
            user = session.exec(select(User).where(User.email == identifier)).first()
            identifier_type = "邮箱"

        if not user:
            print(f"❌ 错误：用户不存在（{identifier_type}: {identifier}）")
            sys.exit(1)

        # 检查是否已经是管理员
        if user.role == UserRole.ADMIN:
            print(f"⚠️  用户已是管理员：{user.username} ({identifier_type}: {identifier})")
            return

        # 提升为管理员
        user.role = UserRole.ADMIN
        session.add(user)
        session.commit()

        print(f"✅ 成功提升为管理员：{user.username} ({identifier_type}: {identifier})")
        logger.info(f"[PromoteAdmin] User promoted to admin: {user.username} ({identifier})")


def demote_user(identifier: str, is_phone: bool = False) -> None:
    """降级管理员为普通用户"""
    with Session(engine) as session:
        # 查找用户
        if is_phone:
            user = session.exec(select(User).where(User.phone_number == identifier)).first()
            identifier_type = "手机号"
        else:
            user = session.exec(select(User).where(User.email == identifier)).first()
            identifier_type = "邮箱"

        if not user:
            print(f"❌ 错误：用户不存在（{identifier_type}: {identifier}）")
            sys.exit(1)

        # 检查是否是管理员
        if user.role != UserRole.ADMIN:
            print(f"⚠️  用户不是管理员：{user.username} ({identifier_type}: {identifier})")
            return

        # 降级为普通用户
        user.role = UserRole.USER
        session.add(user)
        session.commit()

        print(f"✅ 成功降级为普通用户：{user.username} ({identifier_type}: {identifier})")
        logger.info(f"[PromoteAdmin] Admin demoted to user: {user.username} ({identifier})")


def list_admins() -> None:
    """列出所有管理员"""
    with Session(engine) as session:
        admins = session.exec(select(User).where(User.role == UserRole.ADMIN)).all()

        if not admins:
            print("📭 当前没有管理员")
            return

        print(f"\n📋 管理员列表（共 {len(admins)} 人）：")
        print("-" * 60)
        for idx, admin in enumerate(admins, 1):
            email = admin.email or "-"
            phone = admin.phone_number or "-"
            print(f"{idx}. {admin.username}")
            print(f"   邮箱: {email}")
            print(f"   手机: {phone}")
            print(f"   创建时间: {admin.created_at}")
            print()


def main():
    parser = argparse.ArgumentParser(
        description="管理员权限管理工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  # 通过邮箱提升用户为管理员
  uv run python scripts/promote_admin.py admin@example.com

  # 通过手机号提升用户为管理员（纯数字，不带+86）
  uv run python scripts/promote_admin.py 13800138000 --phone

  # 列出所有管理员
  uv run python scripts/promote_admin.py --list

  # 降级管理员为普通用户
  uv run python scripts/promote_admin.py admin@example.com --demote
        """,
    )

    parser.add_argument("identifier", nargs="?", help="用户邮箱或手机号")
    parser.add_argument("--phone", action="store_true", help="使用手机号查找用户")
    parser.add_argument("--demote", action="store_true", help="降级管理员为普通用户")
    parser.add_argument("--list", action="store_true", help="列出所有管理员")

    args = parser.parse_args()

    # 列出管理员
    if args.list:
        list_admins()
        return

    # 需要提供 identifier
    if not args.identifier:
        parser.print_help()
        sys.exit(1)

    # 提升/降级用户
    if args.demote:
        demote_user(args.identifier, args.phone)
    else:
        promote_user(args.identifier, args.phone)


if __name__ == "__main__":
    main()
