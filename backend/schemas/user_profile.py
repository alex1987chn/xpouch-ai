"""用户资料响应模型。

/api/user/me 此前直接序列化 ORM User 实体，把 password_hash、
verification_code、access_token/refresh_token 等内部列一并带出。
本模型只暴露前端实际消费的字段（frontend types/index.ts UserProfile）。
"""

from datetime import datetime

from pydantic import BaseModel

from models.enums import UserRole


class UserProfileResponse(BaseModel):
    """公开的用户资料（/api/user/me GET/PUT 响应）。"""

    id: str
    username: str
    avatar: str | None = None
    plan: str
    role: UserRole
    updated_at: datetime | None = None
