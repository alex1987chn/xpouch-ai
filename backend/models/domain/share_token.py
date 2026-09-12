"""
分享令牌领域模型

产物分享与模板分享共用本表：明文 token 仅在创建响应中返回一次，库里
只存 SHA-256 哈希（与 OTP/token 的处理一致，utils/secret_hash）。
artifact_id / template_key 二选一，按分享对象写入。
"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from utils.time import utc_now_naive


class ShareToken(SQLModel, table=True):
    """产物分享令牌（撤销 = revoked_at 置时间）"""

    __tablename__ = "share_token"

    id: str = Field(
        default_factory=lambda: str(__import__("uuid").uuid4()),
        primary_key=True,
    )

    # 分享的产物（产物分享时必填；模板分享为空）
    artifact_id: str | None = Field(
        default=None, foreign_key="artifact.id", index=True, max_length=64
    )

    # 分享的模板（模板分享时必填）
    template_key: str | None = Field(default=None, index=True, max_length=128)

    # token 的 SHA-256 哈希（唯一）；明文不落库
    token_hash: str = Field(unique=True, index=True, max_length=64)

    # 创建者（thread.user_id，冗余便于直接校验）
    created_by: str = Field(index=True, max_length=64)

    created_at: datetime = Field(default_factory=utc_now_naive)
    revoked_at: datetime | None = Field(default=None)
