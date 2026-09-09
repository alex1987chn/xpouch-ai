"""Token 刷新 / 登出 / 当前用户信息。"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session

from auth.cookies import clear_auth_cookies, get_refresh_token_from_cookie, set_auth_cookies
from auth.schemas import RefreshResponse, UserResponse
from database import get_session
from dependencies import get_current_user
from models import User
from utils.jwt_handler import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    AuthenticationError,
    verify_token,
)
from utils.logger import logger
from utils.secret_hash import hash_secret
from utils.time import utc_now_naive

router = APIRouter(tags=["Authentication"])


@router.post("/refresh-token", response_model=RefreshResponse)
async def refresh_access_token_endpoint(
    request: Request,  # P0 修复: 从 Cookie 读取
    response: Response,  # P0 修复: 设置新 Cookie
    session: Session = Depends(get_session),
):
    """
    P0 修复: 刷新访问令牌

    功能说明：
    1. 从 Cookie 读取 refresh token
    2. 验证 refresh token
    3. 生成新的 access token
    4. 设置新的 Cookie
    """
    from utils.jwt_handler import refresh_access_token as jwt_refresh

    try:
        # P0 修复: 从 Cookie 获取 refresh token
        refresh_token = get_refresh_token_from_cookie(request)

        # 验证 refresh token
        payload = verify_token(refresh_token, token_type="refresh")
        user_id = payload["sub"]

        # 获取用户
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

        # 生成新的 access token
        new_access_token = jwt_refresh(refresh_token)

        # 更新用户的 access token
        user.access_token = hash_secret(new_access_token)
        user.token_expires_at = utc_now_naive() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        session.add(user)
        session.commit()
        session.refresh(user)

        # P0 修复: 设置新的 Cookie（refresh token 不变）
        set_auth_cookies(response, new_access_token, refresh_token)

        logger.info(f"[Auth] 用户 {user_id} Token 刷新成功")

        return RefreshResponse(
            message="Token 刷新成功", expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


@router.post("/logout")
async def logout(response: Response, current_user: User = Depends(get_current_user)):
    """
    P0 修复: 用户登出

    功能说明：
    1. 清除认证 Cookie
    2. 可选：将 Token 加入黑名单（如果需要）
    """
    # 清除 Cookie
    clear_auth_cookies(response)

    logger.info(f"[Auth] 用户 {current_user.id} 已登出")

    return {"message": "登出成功"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    获取当前登录用户信息

    需要认证：自动从 Cookie 读取 Token
    """
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        avatar=current_user.avatar,
        plan=current_user.plan or "free",
        role=current_user.role,
        phone_number=current_user.phone_number,
        email=current_user.email,
        is_verified=current_user.is_verified,
    )
