"""
JWT工具函数模块

提供JWT令牌的生成、验证和刷新功能。
支持access token和refresh token双令牌机制。

P0 修复: 2025-02-24
- 移除默认密钥，强制使用环境变量
- 缩短 Access Token 过期时间至 60 分钟
- 修复 datetime.utcnow() 已废弃的问题

v3.4.3: 配置单一来源化——secret 与有效期统一从 config.settings 读取，
消除双配置源（此前 config 的生产长度校验对签名路径从未生效）。
"""

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import HTTPException, status

from config import settings

# ============================================================================
# JWT 安全配置（单一来源：config.settings）
# ============================================================================

# import 时即触发 config 的生产校验（生产环境必须强密钥 >= 32 字符）
SECRET_KEY = settings.get_jwt_secret()

ALGORITHM = "HS256"

# 双 Token 架构: Access 短期（默认 60 分钟）+ Refresh 长期（默认 60 天）
# 前端会自动静默刷新，用户无感知
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
REFRESH_TOKEN_EXPIRE_DAYS = settings.refresh_token_expire_days

# 密码加密：直接使用 bcrypt（passlib 已停止维护且与 bcrypt 5.x 不兼容）
# 生成的哈希为标准 $2b$ 格式，与历史 passlib 产出的哈希完全兼容


class AuthenticationError(HTTPException):
    """认证错误"""

    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


def hash_password(password: str) -> str:
    """
    哈希密码

    Args:
        password: 明文密码

    Returns:
        哈希后的密码（$2b$ 格式）
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码

    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码

    Returns:
        是否匹配
    """
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        # 哈希格式非法（如历史脏数据）视为不匹配
        return False


def create_access_token(user_id: str, additional_claims: dict | None = None) -> str:
    """
    创建访问令牌

    P0 修复:
    - 使用分钟而非天作为过期单位
    - 使用 timezone.utc 替代已废弃的 utcnow()

    Args:
        user_id: 用户ID
        additional_claims: 额外的声明信息

    Returns:
        JWT access token
    """
    # P0 修复: 使用 timezone.utc
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {"sub": user_id, "type": "access", "exp": expire.timestamp()}

    if additional_claims:
        payload.update(additional_claims)

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """
    创建刷新令牌

    P0 修复: 使用 timezone.utc 替代已废弃的 utcnow()

    Args:
        user_id: 用户ID

    Returns:
        JWT refresh token
    """
    # P0 修复: 使用 timezone.utc
    expire = datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    payload = {"sub": user_id, "type": "refresh", "exp": expire.timestamp()}

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str, token_type: str = "access") -> dict:
    """
    验证令牌

    Args:
        token: JWT令牌
        token_type: 期望的令牌类型（access 或 refresh）

    Returns:
        解码后的payload

    Raises:
        AuthenticationError: 令牌无效或过期
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # 验证令牌类型
        if payload.get("type") != token_type:
            raise AuthenticationError(
                f"Invalid token type. Expected {token_type}, got {payload.get('type')}"
            )

        return payload

    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token has expired") from None
    except jwt.InvalidTokenError:
        raise AuthenticationError("Invalid token") from None


def refresh_access_token(refresh_token_str: str) -> str:
    """
    使用刷新令牌生成新的访问令牌

    Args:
        refresh_token_str: 刷新令牌

    Returns:
        新的访问令牌

    Raises:
        AuthenticationError: 刷新令牌无效
    """
    # 验证刷新令牌
    payload = verify_token(refresh_token_str, token_type="refresh")
    user_id = payload["sub"]

    # 生成新的访问令牌
    return create_access_token(user_id)
