"""手机验证码登录/注册（send-code / verify-code）。"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlmodel import Session, select

from auth.cookies import set_auth_cookies
from auth.limiter import extract_client_ip, record_sms_send, sms_ip_limit_exhausted
from auth.schemas import LoginResponse, SendCodeRequest, VerifyCodeRequest
from auth.verify import (
    _clear_verification_code,
    _reset_verification_state,
    _verify_code_or_raise,
)
from config import settings
from database import get_session
from models import User
from utils.jwt_handler import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, create_refresh_token
from utils.logger import logger
from utils.secret_hash import hash_secret
from utils.sms_service import send_verification_code_with_fallback
from utils.time import utc_now_naive
from utils.verification import (
    VerificationCodeRateLimitError,
    enforce_send_rate_limit,
    generate_verification_code,
    get_code_expiry_duration,
    mask_phone_number,
    register_code_send,
    utcnow,
)

router = APIRouter(tags=["Authentication"])


def _is_fresh_install(session: Session) -> bool:
    """空库判定：user 表无任何行视为全新自部署。"""
    return session.exec(select(func.count()).select_from(User)).one() == 0


@router.post("/send-code")
async def send_verification_code(
    request: SendCodeRequest, http_request: Request, session: Session = Depends(get_session)
):
    """
    发送手机验证码
    """
    try:
        # IP 频控：公共注册站的短信成本止损（私有部署可经 SMS_IP_MAX_SENDS_PER_HOUR 调整/关闭）
        client_ip = extract_client_ip(http_request)
        if settings.sms_ip_max_sends_per_hour > 0 and sms_ip_limit_exhausted(
            client_ip, window_seconds=3600, max_sends=settings.sms_ip_max_sends_per_hour
        ):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="该网络发送验证码过于频繁，请稍后再试",
            )

        phone_number = request.phone_number
        masked_phone = mask_phone_number(phone_number)
        logger.info("[Auth] 收到发送验证码请求: %s", masked_phone)

        user = session.exec(select(User).where(User.phone_number == phone_number)).first()

        # 忘记密码：验证码只发给已注册手机号，不做登录/注册那套自动建号
        if user is None and request.purpose == "password_reset":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="账号不存在",
            )

        is_new_user = user is None
        if user is None:
            import uuid

            # 首跑 bootstrap：全新部署（user 表为空）的首个注册者自动成为管理员，
            # 免去 INITIAL_ADMIN_* 环境变量；存量实例/公共站（非空库）不受影响，
            # 仍走 utils/admin_init.py 的环境变量 bootstrap。
            user = User(
                id=str(uuid.uuid4()),
                username=f"用户{phone_number[-4:]}",
                phone_number=phone_number,
                auth_provider="phone",
                is_verified=False,
                role="admin" if _is_fresh_install(session) else "user",
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

        user.verification_code = hash_secret(code)
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

        # 仅成功计费的发送计入 IP 额度
        record_sms_send(client_ip)

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
        # 脱敏：内部异常细节只进日志，不回传客户端
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="服务器内部错误，请稍后重试",
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

    # 验证验证码（登录/注册与忘记密码共用校验与防爆破语义）
    _verify_code_or_raise(user, code, session)

    # 验证成功，生成token
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    # 更新用户信息
    user.is_verified = True
    user.last_login_at = utc_now_naive()
    user.access_token = hash_secret(access_token)
    user.refresh_token = hash_secret(refresh_token)
    user.token_expires_at = utc_now_naive() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
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
