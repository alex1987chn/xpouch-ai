"""用户资料响应模型。

/api/user/me 此前直接序列化 ORM User 实体，把 password_hash、
verification_code、access_token/refresh_token 等内部列一并带出。
本模型只暴露前端实际消费的字段（frontend types/index.ts UserProfile）。
"""

from datetime import datetime

from pydantic import BaseModel

from models.enums import UserRole


class UserProfileResponse(BaseModel):
    """公开的用户资料（/api/user/me GET/PUT 响应）。

    按「恒序列化、值可空的字段不写默认值」约定，全部字段无默认值——
    _to_profile_response 恒传全键。
    """

    id: str
    username: str
    avatar: str | None
    plan: str
    role: UserRole
    created_at: datetime | None
    updated_at: datetime | None
    # 是否已设置密码（布尔，不含哈希本身）——前端据此决定是否要求旧密码
    has_password: bool


# 可更新字段白名单：此模型即边界，往 User 模型加敏感列（plan/quota/role 等）
# 不会自动变成"用户可改"。plan 属配额语义，只能由管理侧流程变更。
class UpdateUserRequest(BaseModel):
    username: str | None = None
    avatar: str | None = None


class UpdateUserSettingsRequest(BaseModel):
    """全局模型偏好更新请求（v3.4.7 起为实例级配置，仅 ADMIN 可写）。

    simple_model 为 null 表示清除选择、跟随系统默认模型（env MODEL_NAME）；
    simple_thinking 三态：auto（跟随系统默认）/ enabled / disabled。
    """

    simple_model: str | None = None
    simple_thinking: str | None = None
