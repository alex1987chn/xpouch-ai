"""敏感值入库前的单向哈希工具。

适用：验证码（OTP）、访问/刷新令牌等只需"验证是否匹配"、无需取回原值的字段。
SHA-256 足够——原值本身是高熵随机串或 6 位数字配合尝试次数限制与过期时间，
不需要 bcrypt 级别的慢哈希。

存量数据兼容：旧明文行无需迁移——OTP 5 分钟过期自然淘汰，token 下次
登录/刷新即覆盖为哈希值。compare_hash 对旧明文行返回不匹配，用户重发即可。
"""

import hashlib


def hash_secret(value: str) -> str:
    """SHA-256 十六进制哈希，用于入库存储。"""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def compare_hash(stored: str | None, provided: str) -> bool:
    """常量时间比较 provided 的哈希与 stored 哈希。

    stored 为 None（从未设置/已清除）时返回 False。
    """
    if not stored:
        return False
    import hmac

    return hmac.compare_digest(stored, hash_secret(provided))
