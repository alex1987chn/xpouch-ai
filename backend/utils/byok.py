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
