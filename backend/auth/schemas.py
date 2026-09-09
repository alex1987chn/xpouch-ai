"""认证相关 Pydantic 模型。"""

from pydantic import BaseModel, Field, field_validator

from models import UserRole
from utils.verification import validate_phone_number


class SendCodeRequest(BaseModel):
    """发送验证码请求"""

    phone_number: str = Field(..., description="手机号码")
    purpose: str = Field(
        default="login",
        pattern="^(login|password_reset)$",
        description="验证码用途：login=登录/注册，password_reset=忘记密码",
    )

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


class PasswordLoginRequest(BaseModel):
    """密码登录请求（identifier 支持手机号或邮箱）"""

    identifier: str = Field(..., min_length=3, max_length=64, description="手机号或邮箱")
    password: str = Field(..., min_length=1, max_length=128)


class SetPasswordRequest(BaseModel):
    """设置密码请求（已登录用户；已有密码时必须提供 old_password）"""

    password: str = Field(..., min_length=8, max_length=128, description="新密码（至少 8 位）")
    old_password: str | None = Field(default=None, max_length=128)


class ResetPasswordRequest(BaseModel):
    """忘记密码重置请求（手机验证码通道）"""

    phone_number: str = Field(..., description="手机号码")
    code: str = Field(..., min_length=4, max_length=6, description="验证码")
    password: str = Field(..., min_length=8, max_length=128, description="新密码（至少 8 位）")

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not validate_phone_number(v):
            raise ValueError("请输入有效的手机号码")
        return v
