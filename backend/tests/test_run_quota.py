"""用户日 token 配额：KV 读写往返、脏数据防御、超限判定。"""

from types import SimpleNamespace
from unittest.mock import MagicMock

from services.run_quota import (
    load_daily_token_quota,
    save_daily_token_quota,
    today_token_usage_exceeds_quota,
)


class _KVStubSession:
    """支持 get/add/commit/delete 的最小会话桩（单键）"""

    def __init__(self, value: str | None = None):
        self._key = "user_daily_token_quota"
        self._value = value

    def get(self, model, pk):  # noqa: ANN001
        if pk == self._key and self._value is not None:
            return SimpleNamespace(key=self._key, value=self._value)
        return None

    def add(self, instance):  # noqa: ANN001
        self._value = instance.value

    def delete(self, instance):  # noqa: ANN001
        self._value = None

    def commit(self):
        pass


class _OneResult:
    """聚合查询结果桩（提供 .one()）"""

    def __init__(self, value):
        self._value = value

    def one(self):
        return self._value


def _usage_session(used: int):
    """exec 聚合结果为固定值的会话桩"""
    session = MagicMock()
    session.exec.return_value = _OneResult(used)
    return session


def test_quota_unset_means_unlimited():
    assert load_daily_token_quota(_KVStubSession(None)) is None
    assert load_daily_token_quota(_KVStubSession("not-a-number")) is None
    assert load_daily_token_quota(_KVStubSession("0")) is None


def test_quota_save_then_load_roundtrip():
    session = _KVStubSession()
    assert save_daily_token_quota(session, 50000) == 50000
    assert load_daily_token_quota(session) == 50000
    save_daily_token_quota(session, None)
    assert load_daily_token_quota(session) is None


def test_today_usage_exceeds_quota():
    assert today_token_usage_exceeds_quota(_usage_session(50_000), "u1", 50_000) is True
    assert today_token_usage_exceeds_quota(_usage_session(49_999), "u1", 50_000) is False
