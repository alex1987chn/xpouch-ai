"""管理域请求 DTO。

从 routers/admin.py 归拢（T2 请求侧契约锚点，2026-09-27）：类名即
OpenAPI schema 名，frontend/src/types/api.generated.ts 的请求形状由
本文件生成。响应 DTO 仍留在路由文件，随响应侧后续收敛。
"""

from typing import Literal

from pydantic import BaseModel, field_validator
from pydantic import Field as PydanticField

from config import settings
from models.enums import UserRole


class ExpertUpdate(BaseModel):
    """专家更新 DTO"""

    name: str | None = PydanticField(default=None, description="专家显示名称（仅动态专家可修改）")
    system_prompt: str = PydanticField(..., min_length=10, description="系统提示词（至少10个字符）")
    description: str | None = PydanticField(
        default=None, description="专家能力描述，用于 Planner 决定任务分配"
    )
    model: str = PydanticField(default_factory=lambda: settings.model_name, description="模型名称")
    temperature: float = PydanticField(
        default=0.5, ge=0.0, le=2.0, description="温度参数（0.0-2.0）"
    )
    expected_version: int = PydanticField(default=0, description="期望的配置版本号（乐观锁）")

    @field_validator("system_prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        if not v or len(v.strip()) < 10:
            raise ValueError("system_prompt 不能为空且长度必须大于 10")
        return v.strip()


class ExpertCreate(BaseModel):
    """专家创建 DTO"""

    expert_type: str = PydanticField(..., min_length=1, description="专家类型标识（唯一）")
    name: str = PydanticField(..., min_length=1, description="专家显示名称")
    description: str | None = PydanticField(
        default=None, description="专家能力描述，用于 Planner 决定任务分配"
    )
    system_prompt: str = PydanticField(..., min_length=10, description="系统提示词（至少10个字符）")
    model: str = PydanticField(default_factory=lambda: settings.model_name, description="模型名称")
    temperature: float = PydanticField(
        default=0.5, ge=0.0, le=2.0, description="温度参数（0.0-2.0）"
    )

    @field_validator("expert_type")
    @classmethod
    def validate_expert_type(cls, v: str) -> str:
        if not v or len(v.strip()) < 1:
            raise ValueError("expert_type 不能为空")
        # 只允许小写字母、数字和下划线
        import re

        if not re.match(r"^[a-z][a-z0-9_]*$", v.strip()):
            raise ValueError("expert_type 必须以字母开头，只能包含小写字母、数字和下划线")
        return v.strip()

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or len(v.strip()) < 1:
            raise ValueError("name 不能为空")
        return v.strip()

    @field_validator("system_prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        if not v or len(v.strip()) < 10:
            raise ValueError("system_prompt 不能为空且长度必须大于 10")
        return v.strip()


class ExpertPreviewRequest(BaseModel):
    """专家预览请求 DTO"""

    expert_type: str
    test_input: str = PydanticField(..., min_length=10, description="测试输入（至少10个字符）")


class GenerateDescriptionRequest(BaseModel):
    """生成专家描述请求 DTO"""

    system_prompt: str = PydanticField(..., min_length=10, description="系统提示词")


class UserPromoteRequest(BaseModel):
    """用户升级请求 DTO"""

    email: str = PydanticField(..., description="用户邮箱地址")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not v or "@" not in v:
            raise ValueError("请输入有效的邮箱地址")
        return v.strip().lower()


class DailyTokenQuotaRequest(BaseModel):
    """每用户日 token 配额更新请求（None/0 = 不限量）"""

    daily_token_quota: int | None = PydanticField(default=None, ge=0, le=1_000_000_000)


class GraphConcurrencyRequest(BaseModel):
    """同层任务并发上限更新请求（1 = 串行）。

    上限由 `services/run_concurrency.MAX_CONCURRENCY_LIMIT` 定义（单一真相源），
    这里只做边界校验；页面输入框与它同源（前端也引同一个值）。
    """

    graph_max_concurrency: int | None = PydanticField(default=None, ge=0, le=64)


class AdminUserUpdate(BaseModel):
    """用户资料/角色编辑（全部可选，仅提交的字段生效）"""

    username: str | None = PydanticField(default=None, min_length=1, max_length=50)
    email: str | None = PydanticField(default=None, max_length=254)
    phone_number: str | None = PydanticField(default=None, max_length=32)
    role: UserRole | None = None


class AdminResetPasswordRequest(BaseModel):
    """重置密码：custom=管理员指定，random=系统生成（仅响应里返回一次）"""

    mode: Literal["custom", "random"] = "random"
    password: str | None = PydanticField(default=None, min_length=8, max_length=64)


class AdminCreateUserRequest(BaseModel):
    """管理员创建用户：手机号为登录身份（OTP），初始密码可选"""

    username: str = PydanticField(min_length=1, max_length=50)
    phone_number: str = PydanticField(min_length=5, max_length=32)
    email: str | None = PydanticField(default=None, max_length=254)
    role: UserRole = UserRole.USER
    initial_password: str | None = PydanticField(default=None, min_length=8, max_length=64)
    generate_random_password: bool = False
