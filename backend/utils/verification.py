"""
验证码工具模块

提供验证码生成、校验和基础风控辅助逻辑。
"""

import hmac
import secrets
import string
from datetime import UTC, datetime, timedelta


class VerificationCodeError(Exception):
    """验证码错误"""

    pass


class VerificationCodeExpiredError(VerificationCodeError):
    """验证码已过期"""

    pass


class VerificationCodeInvalidError(VerificationCodeError):
    """验证码无效"""

    pass


class VerificationCodeRateLimitError(VerificationCodeError):
    """验证码请求过于频繁或已被临时锁定"""

    pass


def utcnow() -> datetime:
    """返回与现有数据库字段兼容的 naive UTC 时间。"""
    return datetime.now(UTC).replace(tzinfo=None)


def generate_verification_code(length: int = 6) -> str:
    """
    生成数字验证码

    Args:
        length: 验证码长度，默认6位

    Returns:
        数字验证码字符串
    """
    if length <= 0:
        raise ValueError("验证码长度必须大于 0")
    return "".join(secrets.choice(string.digits) for _ in range(length))


def enforce_send_rate_limit(
    *,
    last_sent_at: datetime | None,
    send_count: int,
    send_count_reset_at: datetime | None,
    min_interval_seconds: int,
    max_send_per_window: int,
    window_minutes: int,
) -> None:
    """校验发送频率限制。"""
    now = utcnow()
    if (
        last_sent_at is not None
        and min_interval_seconds > 0
        and (now - last_sent_at).total_seconds() < min_interval_seconds
    ):
        raise VerificationCodeRateLimitError("验证码发送过于频繁，请稍后再试")

    if send_count_reset_at is None or now >= send_count_reset_at:
        return

    if send_count >= max_send_per_window:
        raise VerificationCodeRateLimitError("验证码发送次数过多，请稍后再试")


def register_code_send(
    *,
    send_count: int,
    send_count_reset_at: datetime | None,
    window_minutes: int,
) -> tuple[int, datetime]:
    """根据窗口统计返回新的发送计数和重置时间。"""
    now = utcnow()
    if send_count_reset_at is None or now >= send_count_reset_at:
        return 1, now + timedelta(minutes=window_minutes)
    return send_count + 1, send_count_reset_at


def apply_failed_verification_attempt(
    *,
    current_attempts: int,
    max_attempts: int,
    lockout_minutes: int,
) -> tuple[int, datetime | None]:
    """根据失败次数计算新的尝试计数与锁定时间。"""
    new_attempts = current_attempts + 1
    if new_attempts >= max_attempts:
        return new_attempts, utcnow() + timedelta(minutes=lockout_minutes)
    return new_attempts, None


def verify_code(
    stored_code: str | None,
    provided_code: str,
    expires_at: datetime | None,
    *,
    locked_until: datetime | None = None,
) -> bool:
    """
    验证验证码

    Args:
        stored_code: 存储的验证码
        provided_code: 用户提供的验证码
        expires_at: 过期时间
    Returns:
        是否验证成功

    Raises:
        VerificationCodeExpiredError: 验证码已过期
        VerificationCodeInvalidError: 验证码无效
    """
    now = utcnow()

    if locked_until and now < locked_until:
        raise VerificationCodeRateLimitError("验证码尝试次数过多，请稍后再试")

    if not stored_code:
        raise VerificationCodeInvalidError("验证码不存在")

    if expires_at and now > expires_at:
        raise VerificationCodeExpiredError("验证码已过期")

    if not hmac.compare_digest(stored_code, provided_code):
        raise VerificationCodeInvalidError("验证码错误")

    return True


def get_code_expiry_duration(minutes: int = 5) -> datetime:
    """
    获取验证码过期时间

    Args:
        minutes: 有效期（分钟）

    Returns:
        过期时间
    """
    return utcnow() + timedelta(minutes=minutes)


def format_phone_number(phone: str) -> str:
    """
    格式化手机号码

    Args:
        phone: 原始手机号码

    Returns:
        格式化后的手机号码（去除空格和特殊字符）
    """
    return "".join(c for c in phone if c.isdigit())


def validate_phone_number(phone: str) -> bool:
    """
    验证手机号码格式

    Args:
        phone: 手机号码

    Returns:
        是否有效
    """
    phone = format_phone_number(phone)
    # 中国大陆手机号：1开头，11位数字
    return len(phone) == 11 and phone.startswith("1")


def validate_email(email: str) -> bool:
    """
    验证邮箱格式

    Args:
        email: 邮箱地址

    Returns:
        是否有效
    """
    import re

    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None


def mask_phone_number(phone: str, visible_digits: int = 4) -> str:
    """
    脱敏手机号码

    Args:
        phone: 原始手机号码
        visible_digits: 可见的数字位数（从末尾开始）

    Returns:
        脱敏后的手机号码
    """
    phone = format_phone_number(phone)
    if len(phone) != 11:
        return phone

    if visible_digits <= 0:
        return "*" * 11
    if visible_digits >= 8:
        return phone

    middle_length = len(phone) - 3 - visible_digits
    return phone[:3] + "*" * middle_length + phone[-visible_digits:]


def mask_email(email: str) -> str:
    """
    脱敏邮箱地址

    Args:
        email: 邮箱地址

    Returns:
        脱敏后的邮箱地址
    """
    if "@" not in email:
        return email

    username, domain = email.split("@", 1)

    # 用户名保留第一个字符和最后一个字符，中间用*代替
    if len(username) <= 2:
        masked_username = "*" * len(username)
    else:
        masked_username = username[0] + "*" * (len(username) - 2) + username[-1]

    # 域名保留第一部分和后缀，中间用*代替
    domain_parts = domain.split(".")
    if len(domain_parts) >= 2:
        tld = ".".join(domain_parts[-2:])
        main_domain = ".".join(domain_parts[:-2])
        if len(main_domain) <= 2:
            masked_domain = "*" * len(main_domain) + "." + tld
        else:
            masked_domain = main_domain[0] + "*" * (len(main_domain) - 1) + "." + tld
    else:
        masked_domain = domain

    return masked_username + "@" + masked_domain
