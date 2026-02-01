"""
共享依赖模块 - 提取自 main.py
用于避免循环引用
"""
from fastapi import Request, Depends, HTTPException
from sqlmodel import Session
from typing import Optional

from database import get_session
from models import User


async def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
    require_auth: bool = False
) -> User:
    """
    获取当前用户（优先JWT，回退X-User-ID）

    策略：
    1. 首先检查Authorization头（JWT token）
    2. 如果JWT有效，使用JWT中的user_id
    3. 如果没有JWT，回退到X-User-ID头（向后兼容）
    4. 如果require_auth=True且都没有认证，抛出401错误

    Args:
        request: FastAPI请求对象
        session: 数据库会话
        require_auth: 是否强制要求认证（默认False，向后兼容）

    Returns:
        用户对象
    """
    from utils.jwt_handler import verify_token, AuthenticationError as JWTAuthError

    # 策略1: 尝试从Authorization头获取JWT token
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
            # JWT无效，继续尝试其他方式
            pass

    # 策略2: 回退到X-User-ID头（向后兼容） - 仅在非严格认证模式下使用
    if not require_auth:
        user_id = request.headers.get("X-User-ID")
        if user_id:
            user = session.get(User, user_id)
            if user:
                return user
            else:
                # 未启用严格认证时，自动注册新用户（向后兼容）
                user = User(id=user_id, username=f"User-{user_id[:4]}")
                session.add(user)
                session.commit()
                session.refresh(user)
                return user

    # 策略3: 没有任何认证信息 - 仅在非严格认证模式下使用
    if not require_auth:
        # 未启用严格认证时，使用默认用户（向后兼容）
        user = session.get(User, "default-user")
        if user:
            return user
        else:
            user = User(id="default-user", username="Default User")
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    # 严格认证模式：抛出401错误
    raise HTTPException(
        status_code=401,
        detail="Unauthorized. Please login first."
    )


async def get_current_user_with_auth(
    request: Request,
    session: Session = Depends(get_session)
) -> User:
    """要求强制JWT认证的依赖（包装 get_current_user）"""
    return await get_current_user(request, session, require_auth=True)
