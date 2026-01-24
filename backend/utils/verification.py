"""
验证码工具模块

提供验证码的生成、验证和管理功能。
支持手机验证码和邮箱验证码。
"""
import random
import string
from datetime import datetime, timedelta
from typing import Optional


class VerificationCodeError(Exception):
    """验证码错误"""
    pass


class VerificationCodeExpiredError(VerificationCodeError):
    """验证码已过期"""
    pass


class VerificationCodeInvalidError(VerificationCodeError):
    """验证码无效"""
    pass


def generate_verification_code(length: int = 6) -> str:
    """
    生成数字验证码
    
    Args:
        length: 验证码长度，默认6位
        
    Returns:
        数字验证码字符串
    """
    return ''.join(random.choices(string.digits, k=length))


def verify_code(
    stored_code: Optional[str],
    provided_code: str,
    expires_at: Optional[datetime],
    max_attempts: int = 3
) -> bool:
    """
    验证验证码
    
    Args:
        stored_code: 存储的验证码
        provided_code: 用户提供的验证码
        expires_at: 过期时间
        max_attempts: 最大验证次数
        
    Returns:
        是否验证成功
        
    Raises:
        VerificationCodeExpiredError: 验证码已过期
        VerificationCodeInvalidError: 验证码无效
    """
    # 检查验证码是否存在
    if not stored_code:
        raise VerificationCodeInvalidError("验证码不存在")
    
    # 检查是否过期
    if expires_at and datetime.utcnow() > expires_at:
        raise VerificationCodeExpiredError("验证码已过期")
    
    # 验证验证码
    if stored_code != provided_code:
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
    return datetime.utcnow() + timedelta(minutes=minutes)


def format_phone_number(phone: str) -> str:
    """
    格式化手机号码
    
    Args:
        phone: 原始手机号码
        
    Returns:
        格式化后的手机号码（去除空格和特殊字符）
    """
    return ''.join(c for c in phone if c.isdigit())


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
    return len(phone) == 11 and phone.startswith('1')


def validate_email(email: str) -> bool:
    """
    验证邮箱格式
    
    Args:
        email: 邮箱地址
        
    Returns:
        是否有效
    """
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
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
        return '*' * 11
    
    masked_length = 11 - visible_digits
    return phone[:3] + '*' * masked_length + phone[-visible_digits:]


def mask_email(email: str) -> str:
    """
    脱敏邮箱地址
    
    Args:
        email: 邮箱地址
        
    Returns:
        脱敏后的邮箱地址
    """
    if '@' not in email:
        return email
    
    username, domain = email.split('@', 1)
    
    # 用户名保留第一个字符和最后一个字符，中间用*代替
    if len(username) <= 2:
        masked_username = '*' * len(username)
    else:
        masked_username = username[0] + '*' * (len(username) - 2) + username[-1]
    
    # 域名保留第一部分和后缀，中间用*代替
    domain_parts = domain.split('.')
    if len(domain_parts) >= 2:
        tld = '.'.join(domain_parts[-2:])
        main_domain = '.'.join(domain_parts[:-2])
        if len(main_domain) <= 2:
            masked_domain = '*' * len(main_domain) + '.' + tld
        else:
            masked_domain = main_domain[0] + '*' * (len(main_domain) - 1) + '.' + tld
    else:
        masked_domain = domain
    
    return masked_username + '@' + masked_domain
