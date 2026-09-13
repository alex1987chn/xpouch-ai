"""同层任务并发上限：KV 读写往返、脏数据防御、读取链（设置表 → env → 串行）。

这是 C2 那个「页面旋钮」的服务端契约。默认**必须**是串行（1）——并发是显式选择，
不是默认体验；上限存在是为了防手滑（写成 1000 会把 provider 打爆）。
"""

from types import SimpleNamespace

from services.run_concurrency import (
    MAX_CONCURRENCY_LIMIT,
    SERIAL,
    clamp_concurrency,
    load_graph_max_concurrency,
    resolve_graph_max_concurrency,
    save_graph_max_concurrency,
)


class _KVStubSession:
    """支持 get/add/commit/delete 的最小会话桩（单键）"""

    def __init__(self, value: str | None = None):
        self._key = "graph_max_concurrency"
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


class TestLoad:
    def test_unset_means_fall_through_to_env(self):
        assert load_graph_max_concurrency(_KVStubSession(None)) is None

    def test_dirty_values_are_ignored(self):
        assert load_graph_max_concurrency(_KVStubSession("abc")) is None
        assert load_graph_max_concurrency(_KVStubSession("0")) is None
        assert load_graph_max_concurrency(_KVStubSession("-3")) is None

    def test_over_limit_is_clamped(self):
        assert load_graph_max_concurrency(_KVStubSession("1000")) == MAX_CONCURRENCY_LIMIT


class TestSave:
    def test_roundtrip(self):
        session = _KVStubSession()
        assert save_graph_max_concurrency(session, 3) == 3
        assert load_graph_max_concurrency(session) == 3

    def test_serial_clears_the_setting(self):
        session = _KVStubSession("4")
        assert save_graph_max_concurrency(session, 1) == SERIAL
        assert load_graph_max_concurrency(session) is None, "串行 = 未配置（回落到 env）"

    def test_none_clears_the_setting(self):
        session = _KVStubSession("4")
        assert save_graph_max_concurrency(session, None) == SERIAL
        assert load_graph_max_concurrency(session) is None

    def test_over_limit_is_clamped_on_write(self):
        session = _KVStubSession()
        assert save_graph_max_concurrency(session, 999) == MAX_CONCURRENCY_LIMIT


class TestClamp:
    def test_bounds(self):
        assert clamp_concurrency(0) == SERIAL
        assert clamp_concurrency(-5) == SERIAL
        assert clamp_concurrency(1) == 1
        assert clamp_concurrency(MAX_CONCURRENCY_LIMIT + 1) == MAX_CONCURRENCY_LIMIT


class TestResolveChain:
    """读取链：设置表 → env → 串行。默认绝不能是并发。"""

    def test_setting_wins(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "graph_max_concurrency", 5)
        assert resolve_graph_max_concurrency(_KVStubSession("2")) == 2

    def test_env_fallback(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "graph_max_concurrency", 3)
        assert resolve_graph_max_concurrency(_KVStubSession(None)) == 3

    def test_serial_default(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "graph_max_concurrency", 0)
        assert resolve_graph_max_concurrency(None) == SERIAL

    def test_no_session_still_uses_env(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "graph_max_concurrency", 4)
        assert resolve_graph_max_concurrency(None) == 4
