"""GenericWorker 节点行为测试（P3-1：StreamService 拆分前安全网）。

覆盖：任务边界/缺 expert_type 失败路径、无工具调用的完成路径
（fake LLM 注入，不经 DB/网络）、工具循环重入不重发 task.started、
失败路径的 index 推进与 last_expert_result。
"""

import sys
from pathlib import Path
from unittest.mock import patch

import pytest  # noqa: E402

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.nodes.generic import generic_worker_node  # noqa: E402


class _FakeBound:
    """bind/bind_tools 链桩：保持 ainvoke 可达。"""

    def __init__(self, llm):
        self._llm = llm

    def bind(self, **_kwargs):
        return self

    def bind_tools(self, tools):
        self.bound_tools = tools
        return self

    async def ainvoke(self, messages, config=None):
        return await self._llm.ainvoke(messages, config=config)


class _FakeResponse:
    def __init__(self, content: str, tool_calls=None):
        self.content = content
        self.tool_calls = tool_calls or []


class _FakeLLM:
    """按调用次数返回预设响应的最小 LLM 桩。"""

    def __init__(self, responses: list[_FakeResponse]):
        self._responses = list(responses)
        self.calls = 0

    def bind(self, **_kwargs):
        return _FakeBound(self)

    async def ainvoke(self, messages, config=None):
        self.calls += 1
        return self._responses[min(self.calls - 1, len(self._responses) - 1)]


def _base_state(task, index=0, extra=None):
    state = {
        "task_list": [task],
        "current_task_index": index,
        "messages": [],
        "user_id": "u-1",
        "thread_id": None,
        "run_id": None,
        "execution_plan_id": None,
        "recent_artifacts": [],
        "expert_results": [],
    }
    if extra:
        state.update(extra)
    return state


_EXPERT_CONFIG = {
    "name": "Coder",
    "system_prompt": "你是编码专家。{input}",
    "model": "deepseek-v4-flash",
}

_CONFIG_PATCHES = {
    "_generic_expert_cache": {"coder": _EXPERT_CONFIG},
    "get_expert_config_cached": lambda t: _EXPERT_CONFIG,
    "get_model_config": lambda m: {
        "provider": "deepseek",
        "model": m,
        "temperature": 0.6,
    },
    "load_providers_config": lambda: {"providers": {"deepseek": {"content_mode": "string"}}},
}


def _patches():
    return patch.multiple(sys.modules["agents.nodes.generic"], **_CONFIG_PATCHES)


@pytest.mark.asyncio
async def test_returns_failed_when_no_tasks_left():
    result = await generic_worker_node(_base_state({}, index=1))
    assert result["status"] == "failed"
    assert result["error"] == "Task index out of range"


@pytest.mark.asyncio
async def test_returns_failed_when_missing_expert_type():
    result = await generic_worker_node(_base_state({"description": "无专家"}))
    assert result["status"] == "failed"
    assert result["error"] == "Missing expert_type in task"


@pytest.mark.asyncio
async def test_completion_path_advances_index_and_reports():
    """无工具调用：完成态、产出 output/last_expert_result、index+1、LLM 恰好一次。"""
    task = {"id": "t-1", "expert_type": "coder", "description": "写代码", "status": "pending"}
    fake_llm = _FakeLLM([_FakeResponse("最终答案")])

    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch("agents.nodes.generic.filter_tools_for_binding", return_value=([], [])),
    ):
        result = await generic_worker_node(_base_state(task), llm=fake_llm)

    assert result["status"] == "completed"
    assert result["output_result"] == "最终答案"
    assert result["current_task_index"] == 1
    assert result["last_expert_result"]["status"] == "completed"
    assert result["last_expert_result"]["task_id"] == "t-1"
    # 任务完成态回写 task_list
    assert result["task_list"][0]["status"] == "completed"
    assert fake_llm.calls == 1


@pytest.mark.asyncio
async def test_tool_loop_reentry_skips_started_event():
    """工具循环重入（status=in_progress）不再返回 tool_calls 且不重发 started。"""

    class _NoToolResponse(_FakeResponse):
        pass

    task = {"id": "t-1", "expert_type": "coder", "description": "需要工具", "status": "in_progress"}

    state = _base_state(task)
    # messages 末尾是 ToolMessage（工具已执行完的标记）
    from langchain_core.messages import ToolMessage

    state["messages"] = [ToolMessage(content="工具结果", tool_call_id="call-1", name="calculator")]

    tool_calls_seen: list = []

    class _TrackingLLM(_FakeLLM):
        async def ainvoke(self, messages, config=None):
            # 断言工具结果进入了上下文
            assert any(getattr(m, "tool_call_id", None) == "call-1" for m in messages)
            return await super().ainvoke(messages, config=config)

    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
    ):
        result = await generic_worker_node(state, llm=_TrackingLLM([_NoToolResponse("最终回复")]))

    assert result["status"] == "completed"
    assert not result.get("error")
    assert tool_calls_seen == []


@pytest.mark.asyncio
async def test_failure_path_advances_index_and_reports():
    """LLM 抛异常：index 仍推进（防卡死循环），last_expert_result.status=failed。"""
    task = {"id": "t-1", "expert_type": "coder", "description": "会失败", "status": "pending"}

    class _BoomLLM:
        def bind(self, **_kwargs):
            return _FakeBound(self)

        async def ainvoke(self, messages, config=None):
            raise RuntimeError("LLM 爆炸")

    with _patches():
        result = await generic_worker_node(_base_state(task), llm=_BoomLLM())

    assert result["status"] == "failed"
    assert result["current_task_index"] == 1  # 失败也推进，防死循环
    assert result["last_expert_result"]["status"] == "failed"
    assert "LLM" in result["last_expert_result"]["error"]
