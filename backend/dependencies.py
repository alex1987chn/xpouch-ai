"""
共享依赖模块 - 提取自 main.py
用于避免循环引用

P0 修复: 优先从 Cookie 获取 Token，提高安全性
"""
from fastapi import Request, Depends, HTTPException
from sqlmodel import Session
from typing import Optional
import os

from database import get_session
from models import User


async def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
    require_auth: bool = False
) -> User:
    """
    P0 修复: 获取当前用户（优先 Cookie，兼容 Header）

    策略：
    1. 首先检查 Cookie（HttpOnly，推荐方式）
    2. 其次检查 Authorization 头（向后兼容）
    3. 开发环境回退到 X-User-ID 头
    4. 如果 require_auth=True 且都没有认证，抛出 401 错误

    Args:
        request: FastAPI 请求对象
        session: 数据库会话
        require_auth: 是否强制要求认证（默认 False，向后兼容）

    Returns:
        用户对象
    """
    from utils.jwt_handler import verify_token, AuthenticationError as JWTAuthError

    # P0 修复: 策略1 - 优先从 Cookie 获取 JWT token（最安全）
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = verify_token(token, token_type="access")
            user_id = payload["sub"]
            
            user = session.get(User, user_id)
            if user:
                return user
        except JWTAuthError:
            # Token 无效，继续尝试其他方式
            pass

    # 策略2: 尝试从 Authorization 头获取 JWT token（向后兼容）
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = verify_token(token, token_type="access")
            user_id = payload["sub"]
            
            user = session.get(User, user_id)
            if user:
                return user
        except JWTAuthError:
            # JWT 无效，继续尝试其他方式
            pass

    # 策略3: 回退到 X-User-ID 头（仅开发环境）
    # ⚠️ 安全限制：X-User-ID 回退只在 development 环境启用
    # 生产环境强制使用 JWT 认证，防止用户 ID 伪造攻击
    environment = os.getenv("ENVIRONMENT", "development")

    if not require_auth and environment.lower() == "development":
        user_id = request.headers.get("X-User-ID")
        if user_id:
            user = session.get(User, user_id)
            if user:
                return user
            
            # 开发环境自动创建用户（方便开发调试）
            # ⚠️ 生产环境不会执行到这里
            new_user = User(
                id=user_id,
                username=f"dev_user_{user_id[:8]}",
                auth_provider="dev",
                is_verified=True,
                role="user"
            )
            session.add(new_user)
            session.commit()
            session.refresh(new_user)
            print(f"[Auth] 开发环境自动创建用户: {user_id}")
            return new_user

    # 严格认证模式：抛出 401 错误
    raise HTTPException(
        status_code=401,
        detail="Unauthorized. Please login first."
    )


async def get_current_user_with_auth(
    request: Request,
    session: Session = Depends(get_session)
) -> User:
    """要求强制 JWT 认证的依赖（包装 get_current_user）"""
    return await get_current_user(request, session, require_auth=True)
