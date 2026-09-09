"""认证路由包。

原 auth.py 单文件（701 行）拆分：
- schemas.py          Pydantic 模型
- cookies.py          HttpOnly Cookie 配置与读写
- limiter.py          密码登录内存限流（多 worker 前需迁共享存储）
- verify.py           验证码校验与失败锁定
- routes_otp.py       send-code / verify-code（验证码登录/注册）
- routes_password.py  login-password / set-password / reset-password
- routes_account.py   refresh-token / logout / me

__init__ 组装 router 并 re-export 历史公开名（tests 与 main.py 兼容）。
"""

from fastapi import APIRouter

from auth.limiter import (  # tests 直接引用
    _password_attempts,
    _password_attempts_exhausted,
    _record_password_failure,
    _reset_password_failures,
)
from auth.routes_account import (  # noqa: F401
    get_current_user_info,
    logout,
    refresh_access_token_endpoint,
)
from auth.routes_account import router as account_router
from auth.routes_otp import router as otp_router
from auth.routes_otp import (  # noqa: F401
    send_verification_code,
    verify_code_and_login,
)
from auth.routes_password import (  # noqa: F401
    login_with_password,
    reset_password,
    set_password,
)
from auth.routes_password import router as password_router
from auth.schemas import (  # noqa: F401  # tests 直接引用
    LoginResponse,
    PasswordLoginRequest,
    RefreshResponse,
    ResetPasswordRequest,
    SendCodeRequest,
    SetPasswordRequest,
    UserResponse,
    VerifyCodeRequest,
)
from auth.verify import (  # noqa: F401  # tests 直接引用
    _clear_verification_code,
    _reset_verification_state,
    _verify_code_or_raise,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
router.include_router(otp_router)
router.include_router(password_router)
router.include_router(account_router)

__all__ = [
    "router",
    # 模型
    "LoginResponse",
    "PasswordLoginRequest",
    "RefreshResponse",
    "ResetPasswordRequest",
    "SendCodeRequest",
    "SetPasswordRequest",
    "UserResponse",
    "VerifyCodeRequest",
    # 端点函数
    "get_current_user_info",
    "login_with_password",
    "logout",
    "refresh_access_token_endpoint",
    "reset_password",
    "send_verification_code",
    "set_password",
    "verify_code_and_login",
    # 限流内部名（tests 直接引用）
    "_password_attempts",
    "_password_attempts_exhausted",
    "_record_password_failure",
    "_reset_password_failures",
    # 验证码内部名（tests 直接引用）
    "_clear_verification_code",
    "_reset_verification_state",
    "_verify_code_or_raise",
]
