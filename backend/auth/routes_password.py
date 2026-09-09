"""密码登录 / 设置密码 / 忘记密码重置。"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from auth.cookies import set_auth_cookies
from auth.limiter import (
    _password_attempts_exhausted,
    _record_password_failure,
    _reset_password_failures,
)
from auth.schemas import (
    LoginResponse,
    PasswordLoginRequest,
    ResetPasswordRequest,
    SetPasswordRequest,
    UserResponse,
)
from auth.verify import _clear_verification_code, _verify_code_or_raise
from database import get_session
from dependencies import get_current_user
from models import User
from utils.jwt_handler import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from utils.logger import logger
from utils.secret_hash import hash_secret
from utils.time import utc_now_naive
from utils.verification import mask_phone_number

router = APIRouter(tags=["Authentication"])


@router.post("/login-password", response_model=LoginResponse)
async def login_with_password(
    request: PasswordLoginRequest,
    response: Response,
    session: Session = Depends(get_session),
):
    """
    密码登录（identifier 支持手机号或邮箱）。

    防爆破：同一 identifier 在窗口内失败超过上限后拒绝（内存限流）。
    未设置密码的账号返回 404（与账号不存在同文案，不泄漏存在性）。
    """
    identifier = request.identifier.strip()
    limiter_key = identifier.lower()

    if _password_attempts_exhausted(limiter_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="尝试次数过多，请稍后再试",
        )

    if "@" in identifier:
        user = session.exec(select(User).where(User.email == identifier)).first()
    else:
        user = session.exec(select(User).where(User.phone_number == identifier)).first()

    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="账号不存在或未设置密码登录",
        )

    if not verify_password(request.password, user.password_hash):
        _record_password_failure(limiter_key)
        logger.warning(
            "[Auth] 密码登录失败: %s",
            mask_phone_number(identifier) if "@" not in identifier else identifier,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="密码错误")

    _reset_password_failures(limiter_key)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    user.is_verified = True
    user.access_token = hash_secret(access_token)
    user.refresh_token = hash_secret(refresh_token)
    user.token_expires_at = utc_now_naive() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    session.add(user)
    session.commit()
    session.refresh(user)

    set_auth_cookies(response, access_token, refresh_token)
    logger.info(f"[Auth] 用户 {user.id} 密码登录成功")

    return LoginResponse(
        message="登录成功",
        user_id=user.id,
        username=user.username,
        role=str(user.role) if user.role else "user",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    session: Session = Depends(get_session),
):
    """
    忘记密码：手机验证码验证通过后重置密码。

    - 复用验证码失败锁定（与登录同一套防爆破语义）
    - 重置成功不自动登录，引导用户用新密码重新登录
    """
    user = session.exec(select(User).where(User.phone_number == request.phone_number)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")

    _verify_code_or_raise(user, request.code, session)

    user.password_hash = hash_password(request.password)
    _clear_verification_code(user)
    session.add(user)
    session.commit()
    logger.info("[Auth] 用户 %s 通过验证码重置密码成功", mask_phone_number(request.phone_number))

    return {"message": "密码已重置，请使用新密码登录"}


@router.post("/set-password", response_model=UserResponse)
async def set_password(
    request: SetPasswordRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    设置/修改密码（已登录用户）。

    - 首次设置：无需旧密码
    - 已有密码：必须提供 old_password 校验
    """
    user = session.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if user.password_hash:
        if not request.old_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="已设置过密码，请提供旧密码",
            )
        if not verify_password(request.old_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="旧密码错误")

    user.password_hash = hash_password(request.password)
    session.add(user)
    session.commit()
    session.refresh(user)
    logger.info(f"[Auth] 用户 {user.id} 设置密码成功")

    return UserResponse(
        id=user.id,
        username=user.username,
        avatar=user.avatar,
        plan=user.plan,
        role=user.role,
        phone_number=user.phone_number,
        email=user.email,
        is_verified=user.is_verified,
    )
