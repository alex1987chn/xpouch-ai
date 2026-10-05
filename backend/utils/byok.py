"""BYOK（用户自带 API Key）——加密、上下文与解析。

设计（2026-10-05 BYOK v1）：

- 用户 key 加密落库（Fernet 对称加密，主密钥 BYOK_MASTER_KEY 只活在
  服务端环境变量——库里永远只有密文）；明文任何界面/API 不返回
- 解析链「用户 key > 实例 env key」在 providers_config.get_provider_api_key
  收口（全库唯一 env key 入口）。该函数是**同步**的、而查用户 key 表需要
  异步会话——不做参数穿透（要动 ~10 处调用点且撞异步纪律），改为
  **ContextVar 环境上下文**：请求入口异步加载一次（一条查询解出全部），
  工厂内同步读取。与 set_run_id 的日志上下文同一惯用法；producer 的
  create_task 复制上下文，断连转后台后依旧可解析
- 未装载上下文（管理台预览、离线脚本、embedding）＝ 空表回退 env key，
  行为与 BYOK 之前逐字节一致。embedding 直读 env（providers_config:280），
  天然留在实例 key（v1 排除项，零特判）
- 主密钥未配置（BYOK_MASTER_KEY 空）＝ 功能整体关闭：API 侧报
  「未配置」，解析侧照走 env key

信任边界（文档如实声明）：加密防的是「读库偷 key」；实例管理员在
运行时理论上能拿到明文（代码路径里解密后的值）——自托管 BYOK 的
物理现实，任何同类产品相同，不装作防得住。
"""

from __future__ import annotations

from contextvars import ContextVar, Token

from cryptography.fernet import Fernet, InvalidToken
from sqlmodel import select

from models.domain.user_api_key import UserApiKey
from utils.logger import logger

# 本次执行上下文里的用户 key 表：{provider: 明文 key}
_byok_keys: ContextVar[dict[str, str] | None] = ContextVar("byok_keys", default=None)


# ── 加解密 ───────────────────────────────────────────────────────────


def _fernet() -> Fernet | None:
    """主密钥未配置时返回 None（功能关闭态），不抛错。"""
    from config import settings

    master = settings.byok_master_key
    if not master:
        return None
    try:
        return Fernet(master.encode())
    except Exception as exc:  # noqa: BLE001 — 配置错了要如实炸在启动路径可见处
        raise ValueError(
            "BYOK_MASTER_KEY 不是合法的 Fernet 密钥（生成：openssl rand -base64 32）"
        ) from exc


def byok_enabled() -> bool:
    return _fernet() is not None


def encrypt_key(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str | None:
    """解密失败（换过主密钥/密文损坏）返回 None 并告警——按未配置处理，
    回退实例 key，不让单个坏行拖死整次解析。"""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        logger.warning("[BYOK] 密文解密失败（主密钥更换或数据损坏），该 key 按未配置处理")
        return None


def key_hint(plaintext: str) -> str:
    """掩码提示：只保留尾 4 位（界面展示用，明文永不外泄）。"""
    return f"***{plaintext[-4:]}" if len(plaintext) >= 4 else "***"


# ── 上下文装载（请求入口异步调用一次） ───────────────────────────────


async def load_user_api_keys(db, user_id: str) -> dict[str, str]:
    """一条查询取出该用户全部 key 并解密。未启用/无行/解密失败 → 空表。"""
    if not byok_enabled() or not user_id:
        return {}
    rows = (await db.exec(select(UserApiKey).where(UserApiKey.user_id == user_id))).all()
    keys: dict[str, str] = {}
    for row in rows:
        plaintext = decrypt_key(row.encrypted_key)
        if plaintext:
            keys[row.provider] = plaintext
    return keys


def set_byok_context(keys: dict[str, str]) -> Token:
    return _byok_keys.set(keys)


def reset_byok_context(token: Token) -> None:
    _byok_keys.reset(token)


def resolve_user_key(provider: str) -> str | None:
    """同步解析：当前上下文里该 provider 的用户 key；无上下文/无该行 → None。"""
    keys = _byok_keys.get()
    if not keys:
        return None
    return keys.get(provider)


# ── 凭据类 LLM 错误归因 ───────────────────────────────────────────────

# 视为「凭据/账号侧」失败的 HTTP 状态：key 无效、欠费、无权限、限流。
# 连接错误/超时/5xx 是平台侧问题，与用户 key 无关，不归因。
_CREDENTIAL_STATUS_CODES = {401, 402, 403, 429}


def _exception_status(exc: BaseException) -> int | None:
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        return status
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    return status if isinstance(status, int) else None


def _exception_urls(exc: BaseException) -> str:
    """异常里能挖到的 URL 线索（openai SDK 的 response.url / 异常文本本身）。

    httpx.Response.url 是 URL 对象而非 str，统一 str() 归一。"""
    parts: list[str] = [str(exc)]
    response = getattr(exc, "response", None)
    for source in (
        getattr(response, "url", None),
        getattr(getattr(response, "request", None), "url", None),
    ):
        if source is not None:
            parts.append(str(source))
    return " ".join(parts)


def byok_error_hint(exc: BaseException) -> str | None:
    """凭据类 LLM 失败的归因提示：返回追加到错误消息后的文本，无关则 None。

    判定口径：
    - 仅对 401/402/403/429 归因（见 _CREDENTIAL_STATUS_CODES）
    - 请求入口装载的 key 快照（ContextVar）在本次运行内不可变，工厂每次
      调用都从它解析——「快照里有某 provider」等价于「本次该 provider 的
      调用走的就是用户 key」，错误时重读快照即可确定性归因，无需在
      图执行里回写状态（LangGraph 子任务各自拷贝上下文，写不回来）
    - provider 定位优先用异常里的 base_url 线索；无线索且快照只有一个
      key 时按它归因，多个则列出候选
    """
    if _exception_status(exc) not in _CREDENTIAL_STATUS_CODES:
        return None
    keys = _byok_keys.get()
    if not keys:
        return None

    def _provider_base(provider: str) -> str | None:
        from providers_config import get_provider_config

        config = get_provider_config(provider)
        return (config or {}).get("base_url")

    url_text = _exception_urls(exc)
    attributed = [p for p in keys if (base := _provider_base(p)) and base.rstrip("/") in url_text]
    if len(attributed) == 1 or (not attributed and len(keys) == 1):
        provider = attributed[0] if attributed else next(iter(keys))
        return (
            f"本次 {provider} 调用使用的是你的个人 API key"
            f"（可能已失效、欠费或无权限），请到 设置 → API Keys 更新或删除后重试"
        )
    if len(keys) > 1:
        providers = "、".join(sorted(keys))
        return f"本次运行配置了个人 key：{providers}——若错误与 key 相关，请到 设置 → API Keys 核验"
    return None


def with_byok_hint(exc: BaseException) -> str:
    """错误消息 + BYOK 归因提示（byok_error_hint 的拼接版，错误浮出点直接可用）。"""
    hint = byok_error_hint(exc)
    return f"{exc}；{hint}" if hint else str(exc)
