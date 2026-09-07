"""
分享令牌领域模型

Artifact 单产物分享：明文 token 仅在创建响应中返回一次，库里只存
SHA-256 哈希（与 OTP/token 的处理一致，utils/secret_hash）。
"""

from datetime import datetime

from sqlmodel import Field, SQLModel


class ShareToken(SQLModel, table=True):
    """产物分享令牌（撤销 = revoked_at 置时间）"""

    __tablename__ = "share_token"

    id: str = Field(
        default_factory=lambda: str(__import__("uuid").uuid4()),
        primary_key=True,
    )

    # 分享的产物
    artifact_id: str = Field(foreign_key="artifact.id", index=True, max_length=64)

    # token 的 SHA-256 哈希（唯一）；明文不落库
    token_hash: str = Field(unique=True, index=True, max_length=64)

    # 创建者（thread.user_id，冗余便于直接校验）
    created_by: str = Field(index=True, max_length=64)

    created_at: datetime = Field(default_factory=datetime.now)
    revoked_at: datetime | None = Field(default=None)
