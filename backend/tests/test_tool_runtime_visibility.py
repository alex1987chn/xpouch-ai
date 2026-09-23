"""工具调用可见性：tool.calling / tool.result 事件与账本写入契约。

回归背景（2026-09-23）：专家执行期间的工具调用此前只进后端日志——SSE 实时流、
持久帧、时间线账本三个消费面全黑。本文件锁住 build_tool_call_wrapper 的
发射行为：成功/失败/重试三路径的事件序列、字段与账本写入。

monkeypatch 说明：
- emit_event 是 tool_runtime 模块命名空间的导入绑定，patch 本模块即可；
- 账本走 `_ledger` 里的局部 import（utils.async_task_queue），patch 必须打在
  **源头模块**上；spawn_background 替换为「立即 await」版本，让断言同步可见。
"""

import asyncio

import httpx
from langchain_core.messages import AIMessage
from langgraph.prebuilt.tool_node import ToolCallRequest

import agents.tool_runtime as tr
import utils.async_task_queue as atq


class _Recorder:
    def __init__(self):
        self.events: list[tuple[str, dict]] = []
        self.ledger_calls: list[dict] = []
        self._tasks: list[asyncio.Task] = []

    async def fake_emit(self, event, config=None):
        self.events.append((event.type.value, dict(event.data)))

    async def fake_append_run_event(self, **kwargs):
        self.ledger_calls.append(kwargs)

    def fake_spawn(self, coro, label=None):
        # 真实 spawn_background 是同步调度（后台任务）；测试里挂到当前循环，
        # 断言前 drain() 让它真正执行完。
        self._tasks.append(asyncio.get_running_loop().create_task(coro))

    async def drain(self):
        await asyncio.sleep(0)
        for task in self._tasks:
            await task


def _make_wrapper(recorder, monkeypatch, *, task_id="t-1"):
    monkeypatch.setattr(tr, "emit_event", recorder.fake_emit)
    monkeypatch.setattr(tr, "RETRY_DELAYS", [0.0, 0.0])
    monkeypatch.setattr(atq, "async_append_run_event", recorder.fake_append_run_event)
    monkeypatch.setattr(atq, "spawn_background", recorder.fake_spawn)
    return tr.build_tool_call_wrapper(
        {"search_web"},
        config=None,
        task_id=task_id,
        expert_type="search",
        run_id="run-1",
        thread_id="th-1",
        execution_plan_id="plan-1",
    )


def _request(name="search_web", call_id="c-1", args=None):
    return ToolCallRequest(
        tool_call={"name": name, "id": call_id, "args": args or {"q": "rust"}},
        tool=None,
        state=None,
        runtime=None,
    )


async def _ok_handler(request):
    return AIMessage(content="done")


async def _fail_handler(request):
    raise httpx.ConnectError("boom")


async def test_success_path_emits_calling_then_result(monkeypatch):
    recorder = _Recorder()
    wrapper = _make_wrapper(recorder, monkeypatch)

    result = await wrapper(_request(), _ok_handler)

    assert result.content == "done"
    await recorder.drain()
    types = [t for t, _ in recorder.events]
    assert types == ["tool.calling", "tool.result"]

    calling = recorder.events[0][1]
    assert calling["task_id"] == "t-1"
    assert calling["expert_type"] == "search"
    assert calling["tool"] == "search_web"
    assert calling["source"] == "builtin"
    assert calling["attempt"] == 1
    assert "rust" in calling["args_summary"]

    res = recorder.events[1][1]
    assert res["success"] is True
    assert res["duration_ms"] >= 0
    assert res["error"] is None

    # 账本：一次 tool_result（MCP 工具则 source=mcp）
    assert len(recorder.ledger_calls) == 1
    ledger = recorder.ledger_calls[0]
    assert ledger["event_type"] == "tool_result"
    assert ledger["run_id"] == "run-1"
    assert ledger["task_id"] == "t-1"
    assert ledger["event_data"]["success"] is True


async def test_retryable_failure_exhausted_emits_failed_result(monkeypatch):
    recorder = _Recorder()
    wrapper = _make_wrapper(recorder, monkeypatch)

    result = await wrapper(_request(), _fail_handler)

    assert result.status == "error"
    await recorder.drain()
    # ConnectError 可重试：两次尝试 → 两次 calling（attempt 1/2）→ 终态一次 result
    types = [t for t, _ in recorder.events]
    assert types == ["tool.calling", "tool.calling", "tool.result"]
    assert [recorder.events[i][1]["attempt"] for i in (0, 1)] == [1, 2]

    res = recorder.events[2][1]
    assert res["success"] is False
    assert res["error"] is not None
    assert len(recorder.ledger_calls) == 1
    assert recorder.ledger_calls[0]["event_data"]["success"] is False


async def test_retry_then_success_single_result(monkeypatch):
    recorder = _Recorder()
    wrapper = _make_wrapper(recorder, monkeypatch)

    calls = {"n": 0}

    async def flaky(request):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectTimeout("slow handshake")
        return AIMessage(content="recovered")

    result = await wrapper(_request(), flaky)

    assert result.content == "recovered"
    await recorder.drain()
    # 重试可见：两次 calling，但 result 只有一次（终态）——回看不重复计数
    types = [t for t, _ in recorder.events]
    assert types == ["tool.calling", "tool.calling", "tool.result"]
    assert recorder.events[2][1]["success"] is True
    assert len(recorder.ledger_calls) == 1


async def test_mcp_tool_source_tagged(monkeypatch):
    recorder = _Recorder()
    wrapper = _make_wrapper(recorder, monkeypatch)

    await wrapper(_request(name="maps_geo", call_id="c-2"), _ok_handler)

    assert recorder.events[0][1]["source"] == "mcp"
    assert recorder.events[1][1]["source"] == "mcp"


async def test_no_task_context_no_events(monkeypatch):
    recorder = _Recorder()
    monkeypatch.setattr(tr, "emit_event", recorder.fake_emit)
    monkeypatch.setattr(tr, "RETRY_DELAYS", [0.0, 0.0])
    monkeypatch.setattr(atq, "async_append_run_event", recorder.fake_append_run_event)
    monkeypatch.setattr(atq, "spawn_background", recorder.fake_spawn)
    wrapper = tr.build_tool_call_wrapper({"search_web"})

    result = await wrapper(_request(), _ok_handler)

    assert result.content == "done"
    assert recorder.events == []
    assert recorder.ledger_calls == []
