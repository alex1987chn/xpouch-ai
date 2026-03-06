"""
管理员初始化工具

提供两种方式初始化管理员：
1. 环境变量自动初始化（INITIAL_ADMIN_EMAIL 或 INITIAL_ADMIN_PHONE）
2. 命令行脚本手动初始化（scripts/promote_admin.py）
"""

from sqlmodel import Session, select

from models import User, UserRole
from utils.logger import logger


def init_admin_from_env(session: Session, admin_email: str | None, admin_phone: str | None) -> None:
    """
    从环境变量初始化管理员

    应用启动时自动调用，提升指定用户为管理员。

    Args:
        session: 数据库会话
        admin_email: 管理员邮箱（优先级更高）
        admin_phone: 管理员手机号（纯数字，不带+86）

    注意：
        - 用户必须先注册，然后才能被提升为管理员
        - 如果用户不存在，会记录警告日志但不会创建用户
        - 如果用户已经是管理员，不会重复操作
        - 手机号格式：纯数字11位，不带+86前缀（如 13800138000）
    """
    if not admin_email and not admin_phone:
        logger.info("[AdminInit] 未配置初始管理员（INITIAL_ADMIN_EMAIL 或 INITIAL_ADMIN_PHONE）")
        return

    # 优先使用邮箱查找
    user = None
    identifier = ""

    if admin_email:
        user = session.exec(select(User).where(User.email == admin_email)).first()
        identifier = f"邮箱 {admin_email}"
    elif admin_phone:
        user = session.exec(select(User).where(User.phone_number == admin_phone)).first()
        identifier = f"手机号 {admin_phone}"

    if not user:
        logger.warning(f"[AdminInit] 用户不存在: {identifier}")
        logger.info("[AdminInit] 请先注册账号，然后重启应用以自动提升为管理员")
        return

    # 检查是否已经是管理员
    if user.role == UserRole.ADMIN:
        logger.info(f"[AdminInit] 用户已是管理员: {identifier} ({user.username})")
        return

    # 提升为管理员
    user.role = UserRole.ADMIN
    session.add(user)
    session.commit()

    logger.info(f"[AdminInit] ✅ 用户已提升为管理员: {identifier} ({user.username})")
