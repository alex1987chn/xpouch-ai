"""专家执行消息契约：消息表作为执行状态真相源的生命周期。

回归背景（2026-09-23 交互重构）：专家执行从思考卡内嵌步骤改为独立助手消息
（对齐 Manus 过程消息流）。task 开始插入 running 态、完成/失败原位更新，
事件携带同一条消息的 id——前端实时流与库是同一份数据。

本文件用会话替身锁住状态机：插入骨架 → 完成更新（产物引用+工具统计快照）
→ 失败更新（如实保留错误）；task_id 定位与找不到消息的降级。
"""

from types import SimpleNamespace
from typing import Any

import pytest

import services.chat.expert_message as em
from services.chat.expert_message import (
    EXPERT_MESSAGE_KIND,
    complete_expert_message,
    fail_expert_message,
    insert_expert_message,
)


class _FakeMessage:
    def __init__(self, **kwargs: Any):
        self.id = kwargs.get("id", 1)
        self.thread_id = kwargs.get("thread_id")
        self.role = kwargs.get("role", "assistant")
        self.content = kwargs.get("content", "")
        self.extra_data = kwargs.get("extra_data")


class _SessionStub:
    """最小会话替身：内存里保存消息与账本行，按 statement 类型分桶返回。"""

    def __init__(self, messages: list, ledger_rows: list | None = None):
        self._messages = messages
        self._ledger = ledger_rows or []
        self.added: list = []

    def add(self, obj) -> None:
        self.added.append(obj)
        # insert 构造的是真实 Message 模型实例（不是替身类）——按对象身份收集
        if obj not in self._messages:
            self._messages.append(obj)

    def commit(self) -> None:
        pass

    def refresh(self, obj) -> None:
        pass

    def rollback(self) -> None:
        pass

    def _session_query(self, statement):
        stmt = str(statement).lower()
        if "message" in stmt:
            rows: list = list(self._messages)
        else:
            # select(RunEvent.event_data) 是列查询：返回 event_data 值本身
            rows = [r.event_data for r in self._ledger]

        class _Result:
            def all(self):
                return rows

        return _Result()

    # SQLModel Session 的方法名就叫 exec；按本仓测试惯例以赋值别名暴露
    exec = _session_query


def _inserted(**over):
    base = {
        "thread_id": "th-1",
        "task_id": "task-1",
        "expert_type": "search",
        "description": "调研",
        "sort_order": 1,
        "total_steps": 2,
    }
    base.update(over)
    return base


@pytest.fixture
def fresh(monkeypatch):
    """让 insert 拿到自增 id。"""
    counter = {"id": 100}
    original = em.insert_expert_message

    def _fake_insert(db, **kwargs):
        msg = original(db, **kwargs)
        msg.id = counter["id"]
        counter["id"] += 1
        return msg

    monkeypatch.setattr(em, "insert_expert_message", _fake_insert)
    return counter


def test_lifecycle_running_to_completed(monkeypatch, fresh):
    messages: list = []
    db = _SessionStub(messages)

    msg = insert_expert_message(db, **_inserted())
    assert msg.extra_data["message_kind"] == EXPERT_MESSAGE_KIND
    assert msg.extra_data["status"] == "running"

    # 完成更新：产物引用 + 工具统计快照（从账本聚合 task 维度）
    ledger = [
        SimpleNamespace(
            event_data={
                "task_id": "task-1",
                "tool": "a",
                "duration_ms": 100,
                "success": True,
                "source": "builtin",
            }
        ),
        SimpleNamespace(
            event_data={
                "task_id": "task-1",
                "tool": "b",
                "duration_ms": 50,
                "success": False,
                "source": "mcp",
            }
        ),
        SimpleNamespace(
            event_data={"task_id": "other", "tool": "c", "duration_ms": 9, "success": True}
        ),
    ]
    db2 = _SessionStub(messages, ledger_rows=ledger)
    updated = complete_expert_message(
        db2,
        thread_id="th-1",
        task_id="task-1",
        run_id="run-1",
        artifact_ids=["art-1"],
        duration_ms=4200,
        summary="调研完成",
    )
    assert updated is msg  # 原位更新，不新建
    extra = updated.extra_data
    assert extra["status"] == "completed"
    assert extra["artifact_ids"] == ["art-1"]
    assert extra["duration_ms"] == 4200
    assert extra["summary"] == "调研完成"
    # 只聚合本任务的两条（other 不算），失败一次
    assert extra["tool_stats"] == {"count": 2, "total_ms": 150, "failed": 1}
    # 逐次明细快照（终态可展开的明细行，source 归一缺省 builtin）
    assert extra["tool_calls"] == [
        {"tool": "a", "duration_ms": 100, "success": True, "source": "builtin"},
        {"tool": "b", "duration_ms": 50, "success": False, "source": "mcp"},
    ]


def test_fail_keeps_error(monkeypatch, fresh):
    messages: list = []
    db = _SessionStub(messages)
    insert_expert_message(db, **_inserted())

    updated = fail_expert_message(
        _SessionStub(messages), thread_id="th-1", task_id="task-1", error="boom"
    )
    assert updated.extra_data["status"] == "failed"
    assert updated.extra_data["error"] == "boom"


def test_missing_message_degrades_to_none(monkeypatch, fresh):
    messages: list = []
    db = _SessionStub(messages)
    insert_expert_message(db, **_inserted())

    assert (
        complete_expert_message(
            _SessionStub(messages),
            thread_id="th-1",
            task_id="ghost",
            run_id=None,
            artifact_ids=[],
            duration_ms=1,
            summary=None,
        )
        is None
    )
    assert (
        fail_expert_message(_SessionStub(messages), thread_id="th-1", task_id="ghost", error="x")
        is None
    )


# ---------------------------------------------------------------------------
# 思考载体消息（run_thinking）：复杂执行轮的思考锚点行
# ---------------------------------------------------------------------------


def test_run_thinking_insert_shape_and_idempotency(monkeypatch):
    from services.chat.expert_message import insert_run_thinking_message

    messages: list = []
    counter = {"id": 500}
    _orig_add = _SessionStub.add

    def _add_with_id(self, obj):
        _orig_add(self, obj)
        if getattr(obj, "id", None) is None:
            obj.id = counter["id"]
            counter["id"] += 1

    monkeypatch.setattr(_SessionStub, "add", _add_with_id)

    first = insert_run_thinking_message(_SessionStub(messages), thread_id="th-1", run_id="run-1")
    assert first == 500
    msg = messages[0]
    assert msg.role == "assistant"
    assert msg.content == "", "思考载体恒空正文——步骤不入库，由账本重建挂回"
    assert msg.extra_data == {"message_kind": "run_thinking", "run_id": "run-1"}

    # 幂等：驳回修订重跑 commander 时同 run 不得插第二行
    second = insert_run_thinking_message(_SessionStub(messages), thread_id="th-1", run_id="run-1")
    assert second == 500
    assert len(messages) == 1

    # 不同 run 各有一行（多轮对话）
    third = insert_run_thinking_message(_SessionStub(messages), thread_id="th-1", run_id="run-2")
    assert third == 501
    assert len(messages) == 2
