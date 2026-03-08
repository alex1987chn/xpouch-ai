"""
RunEvent 功能测试

测试运行事件账本的写入和查询功能。
使用 _FakeSession 模拟数据库会话，不依赖真实数据库。
"""

from models import RunEvent, RunEventType


class _FakeSession:
    """模拟数据库会话"""

    def __init__(self):
        self.events: dict[int, RunEvent] = {}
        self._next_id = 1
        self.commit_called = False

    def add(self, obj):
        if isinstance(obj, RunEvent):
            if obj.id is None:
                obj.id = self._next_id
                self._next_id += 1
            self.events[obj.id] = obj

    def flush(self):
        return None

    def commit(self):
        self.commit_called = True

    def get(self, model, object_id):
        if model is RunEvent:
            return self.events.get(object_id)
        return None

    def exec(self, statement):
        """模拟 SQLModel 的 exec 方法"""
        # 简单实现：返回所有事件
        return _FakeResult(list(self.events.values()))


class _FakeResult:
    """模拟查询结果"""

    def __init__(self, items):
        self._items = items

    def all(self):
        return self._items

    def first(self):
        return self._items[0] if self._items else None


class TestRunEventModel:
    """测试 RunEvent 模型"""

    def test_run_event_type_enum_values(self):
        """测试事件类型枚举值"""
        assert RunEventType.RUN_CREATED.value == "run_created"
        assert RunEventType.ROUTER_DECIDED.value == "router_decided"
        assert RunEventType.HITL_INTERRUPTED.value == "hitl_interrupted"
        assert RunEventType.RUN_COMPLETED.value == "run_completed"
        assert RunEventType.RUN_FAILED.value == "run_failed"

    def test_run_event_model_fields(self):
        """测试 RunEvent 模型字段"""
        event = RunEvent(
            run_id="test-run-id",
            event_type=RunEventType.RUN_CREATED,
            event_data={"mode": "simple"},
            thread_id="test-thread-id",
        )
        assert event.run_id == "test-run-id"
        assert event.event_type == RunEventType.RUN_CREATED
        assert event.event_data == {"mode": "simple"}
        assert event.thread_id == "test-thread-id"


class TestRunEventCRUD:
    """测试 RunEvent CRUD 操作"""

    def test_append_run_event(self):
        """测试追加事件"""
        from crud.run_event import append_run_event

        session = _FakeSession()
        event = append_run_event(
            session,
            run_id="test-run-id",
            event_type=RunEventType.RUN_CREATED,
            event_data={"entrypoint": "chat", "mode": "simple"},
            thread_id="test-thread-id",
        )

        assert event.id is not None
        assert event.run_id == "test-run-id"
        assert event.event_type == RunEventType.RUN_CREATED
        assert event.timestamp is not None

    def test_emit_convenience_functions(self):
        """测试便捷事件发送函数"""
        from crud.run_event import emit_router_decided, emit_run_created

        session = _FakeSession()
        event = emit_run_created(
            session,
            run_id="test-run-id",
            thread_id="test-thread-id",
            entrypoint="chat",
            mode="simple",
        )

        assert event.event_type == RunEventType.RUN_CREATED
        assert event.event_data == {"entrypoint": "chat", "mode": "simple"}

        event2 = emit_router_decided(
            session,
            run_id="test-run-id",
            thread_id="test-thread-id",
            mode="complex",
            reason="User requested multi-step task",
        )

        assert event2.event_type == RunEventType.ROUTER_DECIDED
        assert event2.event_data["mode"] == "complex"
        assert event2.event_data["reason"] == "User requested multi-step task"
