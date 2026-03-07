"""
认证路由模块

P0 安全修复: 2025-02-24
- 将 Token 从 JSON 响应改为 HttpOnly Cookie
- 防止 XSS 攻击窃取 Token
- 新增登出端点清除 Cookie

提供用户认证相关的API端点，包括：
- 手机验证码发送
- 手机验证码验证（登录/注册）
- Token刷新
- 登出（清除 Cookie）
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from config import settings
from database import get_session
from models import User, UserRole
from utils.jwt_handler import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    AuthenticationError,
    create_access_token,
    create_refresh_token,
    verify_token,
)
from utils.logger import logger
from utils.sms_service import send_verification_code_with_fallback
from utils.verification import (
    VerificationCodeExpiredError,
    VerificationCodeInvalidError,
    VerificationCodeRateLimitError,
    apply_failed_verification_attempt,
    enforce_send_rate_limit,
    generate_verification_code,
    get_code_expiry_duration,
    mask_phone_number,
    register_code_send,
    utcnow,
    validate_phone_number,
    verify_code,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ==================== Pydantic模型 ====================


class SendCodeRequest(BaseModel):
    """发送验证码请求"""

    phone_number: str = Field(..., description="手机号码")

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not validate_phone_number(v):
            raise ValueError("请输入有效的手机号码")
        return v


class VerifyCodeRequest(BaseModel):
    """验证验证码请求"""

    phone_number: str = Field(..., description="手机号码")
    code: str = Field(..., min_length=4, max_length=6, description="验证码")

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not validate_phone_number(v):
            raise ValueError("请输入有效的手机号码")
        return v


class LoginResponse(BaseModel):
    """P0 修复: 登录响应（不再包含 Token）"""

    message: str
    user_id: str
    username: str
    role: str
    expires_in: int  # access token 过期时间（秒）


class RefreshResponse(BaseModel):
    """P0 修复: 刷新响应"""

    message: str
    expires_in: int  # 新的 access token 过期时间（秒）


class UserResponse(BaseModel):
    """用户信息响应"""

    id: str
    username: str
    avatar: str | None
    plan: str
    role: UserRole
    phone_number: str | None
    email: str | None
    is_verified: bool


# ==================== Cookie 配置 ====================


# P0 修复: Cookie 安全配置
def get_cookie_config():
    """获取 Cookie 配置"""
    return {
        "httponly": True,  # JavaScript 无法读取
        "secure": settings.is_production,  # 生产环境必须使用 HTTPS
        "samesite": "lax",  # 防止 CSRF，同时允许部分跨站导航
        "path": "/",  # 全站可用
    }


def _reset_verification_state(user: User) -> None:
    """重置验证码失败计数和锁定状态。"""
    user.verification_code_attempts = 0
    user.verification_code_locked_until = None


def _clear_verification_code(user: User) -> None:
    """清理验证码及其临时状态。"""
    user.verification_code = None
    user.verification_code_expires_at = None
    _reset_verification_state(user)


# ==================== 辅助函数 ====================


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """
    P0 修复: 设置认证 Cookie

    Args:
        response: FastAPI Response 对象
        access_token: 访问令牌
        refresh_token: 刷新令牌
    """
    cookie_config = get_cookie_config()

    # Access Token: 60 分钟
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # 秒
        **cookie_config,
    )

    # Refresh Token: 60 天
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,  # 秒
        **cookie_config,
    )

    logger.info("[Auth] Cookie 设置完成")


def clear_auth_cookies(response: Response) -> None:
    """
    P0 修复: 清除认证 Cookie（登出用）

    Args:
        response: FastAPI Response 对象
    """
    cookie_config = get_cookie_config()

    response.delete_cookie(key="access_token", **cookie_config)
    response.delete_cookie(key="refresh_token", **cookie_config)

    logger.info("[Auth] Cookie 已清除")


def get_refresh_token_from_cookie(request: Request) -> str:
    """
    P0 修复: 从 Cookie 获取 refresh token

    Args:
        request: FastAPI Request 对象

    Returns:
        Refresh token 字符串

    Raises:
        HTTPException: Cookie 不存在
    """
    token = request.cookies.get("refresh_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌不存在，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token


# 从 dependencies 导入统一的 get_current_user
from dependencies import get_current_user

# ==================== API端点 ====================


@router.post("/send-code")
async def send_verification_code(request: SendCodeRequest, session: Session = Depends(get_session)):
    """
    发送手机验证码
    """
    try:
        phone_number = request.phone_number
        masked_phone = mask_phone_number(phone_number)
        logger.info("[Auth] 收到发送验证码请求: %s", masked_phone)

        user = session.exec(select(User).where(User.phone_number == phone_number)).first()
        is_new_user = user is None
        if user is None:
            import uuid

            user = User(
                id=str(uuid.uuid4()),
                username=f"用户{phone_number[-4:]}",
                phone_number=phone_number,
                auth_provider="phone",
                is_verified=False,
                role="user",
            )

        enforce_send_rate_limit(
            last_sent_at=user.verification_code_last_sent_at,
            send_count=user.verification_code_send_count,
            send_count_reset_at=user.verification_code_send_count_reset_at,
            min_interval_seconds=settings.verification_code_send_cooldown_seconds,
            max_send_per_window=settings.verification_code_max_sends_per_window,
            window_minutes=settings.verification_code_send_window_minutes,
        )

        code = generate_verification_code(length=settings.verification_code_length)
        expires_at = get_code_expiry_duration(minutes=settings.verification_code_expire_minutes)
        send_count, send_count_reset_at = register_code_send(
            send_count=user.verification_code_send_count,
            send_count_reset_at=user.verification_code_send_count_reset_at,
            window_minutes=settings.verification_code_send_window_minutes,
        )

        user.verification_code = code
        user.verification_code_expires_at = expires_at
        user.verification_code_last_sent_at = utcnow()
        user.verification_code_send_count = send_count
        user.verification_code_send_count_reset_at = send_count_reset_at
        _reset_verification_state(user)

        success, error_message = send_verification_code_with_fallback(
            phone_number,
            code,
            expire_minutes=settings.verification_code_expire_minutes,
        )
        if not success:
            session.rollback()
            logger.warning("[Auth] 验证码短信发送失败: %s", error_message)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="验证码发送失败，请稍后重试",
            )

        session.add(user)
        session.commit()
        session.refresh(user)

        response_data = {
            "message": "验证码已发送（新用户注册）" if is_new_user else "验证码已发送",
            "expires_in": settings.verification_code_expire_minutes * 60,
            "phone_masked": masked_phone,
        }
        if is_new_user:
            response_data["user_id"] = user.id

        if settings.is_development:
            response_data["_debug_code"] = code

        return response_data
    except VerificationCodeRateLimitError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e)) from None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"发送验证码处理异常: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"服务器内部错误: {str(e)}"
        ) from e


@router.post("/verify-code", response_model=LoginResponse)
async def verify_code_and_login(
    request: VerifyCodeRequest,
    response: Response,  # P0 修复: 需要设置 Cookie
    session: Session = Depends(get_session),
):
    """
    P0 修复: 验证验证码并登录

    功能说明：
    1. 验证手机号码和验证码
    2. 如果验证成功，生成 JWT token
    3. 设置 HttpOnly Cookie（不再返回 Token）
    4. 返回用户基本信息
    """
    phone_number = request.phone_number
    code = request.code

    # 查询用户
    user = session.exec(select(User).where(User.phone_number == phone_number)).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在，请先发送验证码"
        )

    # 验证验证码
    try:
        verify_code(
            stored_code=user.verification_code,
            provided_code=code,
            expires_at=user.verification_code_expires_at,
            locked_until=user.verification_code_locked_until,
        )
    except VerificationCodeExpiredError:
        _clear_verification_code(user)
        session.add(user)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="验证码已过期，请重新发送"
        ) from None
    except VerificationCodeRateLimitError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e)) from None
    except VerificationCodeInvalidError as e:
        attempts, locked_until = apply_failed_verification_attempt(
            current_attempts=user.verification_code_attempts,
            max_attempts=settings.verification_code_max_attempts,
            lockout_minutes=settings.verification_code_lockout_minutes,
        )
        user.verification_code_attempts = attempts
        user.verification_code_locked_until = locked_until
        session.add(user)
        session.commit()
        if locked_until is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="验证码尝试次数过多，请稍后再试",
            ) from None
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None

    # 验证成功，生成token
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    # 更新用户信息
    user.is_verified = True
    user.access_token = access_token
    user.refresh_token = refresh_token
    user.token_expires_at = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    _clear_verification_code(user)

    session.add(user)
    session.commit()
    session.refresh(user)

    # P0 修复: 设置 Cookie（不再返回 Token）
    set_auth_cookies(response, access_token, refresh_token)

    logger.info(f"[Auth] 用户 {user.id} 登录成功，Token 已设置到 Cookie")

    return LoginResponse(
        message="登录成功",
        user_id=user.id,
        username=user.username,
        role=str(user.role) if user.role else "user",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # 秒
    )


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
        user.access_token = new_access_token
        user.token_expires_at = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

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
