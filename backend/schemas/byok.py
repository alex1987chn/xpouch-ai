"""BYOK（用户自带 API Key）请求/响应 DTO。

明文 key 只在写入请求（ApiKeyUpsertRequest）里出现一次，落库即加密，
任何响应只带掩码元信息（key_hint）——明文永不外泄。
"""

from datetime import datetime

from pydantic import BaseModel, Field


class ApiKeyUpsertRequest(BaseModel):
    """录入/更新一个 provider 的 key（覆盖语义：同 provider 整行替换）"""

    provider: str = Field(min_length=1, max_length=64)
    api_key: str = Field(min_length=8, max_length=512)


class ApiKeyMeta(BaseModel):
    """key 元信息（掩码）——用户侧与管理台共用形状"""

    provider: str
    key_hint: str
    updated_at: datetime


class ApiKeyListResponse(BaseModel):
    enabled: bool  # BYOK_MASTER_KEY 未配置时 false（功能关闭态）
    items: list[ApiKeyMeta] = []


class ApiKeyTestResponse(BaseModel):
    """测试连接结果：用已保存的 key 打 provider 的 /models（写入前先存后测，
    或前端先存再测；不测请求体里的明文——避免明文二次传输）"""

    ok: bool
    detail: str
