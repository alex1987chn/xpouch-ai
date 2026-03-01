"""
JWT工具函数模块

提供JWT令牌的生成、验证和刷新功能。
支持access token和refresh token双令牌机制。

P0 修复: 2025-02-24
- 移除默认密钥，强制使用环境变量
- 缩短 Access Token 过期时间至 60 分钟
- 修复 datetime.utcnow() 已废弃的问题
"""
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
from passlib.context import CryptContext
from fastapi import HTTPException, status
import os

# ============================================================================
# P0 修复: JWT 安全配置
# ============================================================================

# P0 修复: 移除默认密钥，强制使用环境变量
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "JWT_SECRET_KEY environment variable is required. "
        "Please set a secure random key in your .env file. "
        "You can generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
    )

ALGORITHM = "HS256"

# Access Token 过期时间: 默认 60 分钟 (工业标准)
# 双 Token 架构: Access Token 短期 + Refresh Token 长期 (60天)
# 前端会自动静默刷新，用户无感知
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "60"))

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
        哈希后的密码
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    
    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码
        
    Returns:
        是否匹配
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: str, additional_claims: Optional[Dict] = None) -> str:
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
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": expire.timestamp()
    }
    
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
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire.timestamp()
    }
    
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str, token_type: str = "access") -> Dict:
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
            raise AuthenticationError(f"Invalid token type. Expected {token_type}, got {payload.get('type')}")
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise AuthenticationError(f"Invalid token: {str(e)}")


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
