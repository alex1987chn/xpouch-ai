"""验证码状态管理与校验（登录/忘记密码共用）。"""

from fastapi import HTTPException, status
from sqlmodel import Session

from config import settings
from models import User
from utils.verification import (
    VerificationCodeExpiredError,
    VerificationCodeInvalidError,
    VerificationCodeRateLimitError,
    apply_failed_verification_attempt,
    verify_code,
)


def _reset_verification_state(user: User) -> None:
    """重置验证码失败计数和锁定状态。"""
    user.verification_code_attempts = 0
    user.verification_code_locked_until = None


def _clear_verification_code(user: User) -> None:
    """清理验证码及其临时状态。"""
    user.verification_code = None
    user.verification_code_expires_at = None
    _reset_verification_state(user)


def _verify_code_or_raise(user: User, code: str, session: Session) -> None:
    """校验验证码；失败按语义转成 HTTPException 并落库失败计数/锁定。

    登录（verify-code）与忘记密码（reset-password）共用同一套校验与防爆破语义。
    """
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
