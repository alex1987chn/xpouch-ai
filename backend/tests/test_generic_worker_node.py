"""专家执行节点（分支内）行为测试。

C2（2026-09-13）起该节点跑在 `expert_worker` 子图里，契约随之变化：
- 输入：Send payload 注入的 `current_task` / `dependency_outputs`（不再读 task_list + 游标）
- 草稿：`worker_messages`（不再写主图 messages）
- 输出：`task_outcomes`（不再直接写 task_list / expert_results）——落状态由
  wave_scheduler 的 join 负责，所以这里断言产物本身，不断言计划状态。

覆盖：缺 current_task（接线错误必须炸）、缺 expert_type、无工具调用完成路径（fake LLM
注入，不经 DB/网络）、工具循环重入不重发 task.started、失败路径只产出本任务失败产物。
"""

import sys
from pathlib import Path
from unittest.mock import patch

import pytest  # noqa: E402

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.nodes.generic import GenericWorkerError, expert_worker_node  # noqa: E402


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

    def __getitem__(self, key):
        return getattr(self, key)


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


def _task(task_id="t-1", **overrides):
    task = {
        "id": task_id,
        "task_id": "task_1",
        "expert_type": "coder",
        "description": "写代码",
        "input_data": {},
        "sort_order": 0,
        "status": "pending",
        "depends_on": [],
    }
    task.update(overrides)
    return task


def _branch_state(task, extra=None):
    """分支状态：Send payload 的结构（只含本任务与运行标识）。"""
    state = {
        "current_task": task,
        "dependency_outputs": {},
        "branch_context": {"user_id": "u-1"},
        "worker_messages": [],
    }
    if extra:
        state.update(extra)
    return state


_EXPERT_CONFIG = {
    "name": "Coder",
    "system_prompt": "你是编码专家。{input}",
    "model": "deepseek-flash",
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


def _outcome_of(result) -> dict:
    """取出本分支唯一的那份产物。"""
    outcomes = result["task_outcomes"]
    assert len(outcomes) == 1, f"一个分支恰好产出一份产物，实际 {list(outcomes)}"
    return next(iter(outcomes.values()))


@pytest.mark.asyncio
async def test_missing_current_task_raises():
    """Send payload 没注入任务 = 接线错了，必须炸出来（静默返回会让分支无声消失）。"""
    with pytest.raises(GenericWorkerError):
        await expert_worker_node({"worker_messages": []})


@pytest.mark.asyncio
async def test_missing_expert_type_yields_failed_outcome():
    result = await expert_worker_node(_branch_state({"id": "t-1", "task_id": "task_1"}))

    outcome = _outcome_of(result)
    assert outcome["status"] == "failed"
    assert outcome["error"] == "Missing expert_type in task"
    assert outcome["task_key"] == "task_1"


@pytest.mark.asyncio
async def test_completion_path_yields_outcome():
    """无工具调用：完成态产物（含 artifact）、worker_messages 收尾、LLM 恰好一次。"""
    fake_llm = _FakeLLM([_FakeResponse("最终答案")])

    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch("agents.nodes.generic.filter_tools_for_binding", return_value=([], [])),
    ):
        result = await expert_worker_node(_branch_state(_task(), {}), llm=fake_llm)

    outcome = _outcome_of(result)
    assert outcome["status"] == "completed"
    assert outcome["output"] == "最终答案"
    assert outcome["task_key"] == "task_1"
    assert outcome["db_uuid"] == "t-1"
    assert outcome["expert_type"] == "coder"
    assert outcome["artifact"]["content"] == "最终答案"
    # 分支草稿收尾 + 标记已启动
    assert result["worker_started"] is True
    assert len(result["worker_messages"]) == 1
    # 不写主图状态（并发安全的前提）
    assert "task_list" not in result
    assert "expert_results" not in result
    assert fake_llm.calls == 1


@pytest.mark.asyncio
async def test_tool_call_path_returns_scratch_without_outcome():
    """LLM 要工具：不产出产物（任务没完），只把 AIMessage 放进分支草稿。"""
    tool_calls = [{"name": "calculator", "args": {"expr": "1+1"}, "id": "call-1"}]
    fake_llm = _FakeLLM([_FakeResponse("", tool_calls=tool_calls)])

    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch("agents.nodes.generic.filter_tools_for_binding", return_value=([], [])),
    ):
        result = await expert_worker_node(_branch_state(_task()), llm=fake_llm)

    assert "task_outcomes" not in result, "任务未完成不得产出产物"
    assert result["worker_messages"][0].tool_calls == tool_calls


@pytest.mark.asyncio
async def test_dependency_outputs_are_injected_into_prompt():
    """上游产出经 Send payload 注入 prompt（分支读不到主图状态，只能靠 payload）。"""
    task = _task(depends_on=["task_0"])
    seen: dict = {}

    class _CaptureLLM(_FakeLLM):
        async def ainvoke(self, messages, config=None):
            seen["prompt"] = "\n".join(str(m.content) for m in messages)
            return await super().ainvoke(messages, config=config)

    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch("agents.nodes.generic.filter_tools_for_binding", return_value=([], [])),
    ):
        await expert_worker_node(
            _branch_state(task, {"dependency_outputs": {"task_0": "上游的检索结果"}}),
            llm=_CaptureLLM([_FakeResponse("下游答案")]),
        )

    assert "上游的检索结果" in seen["prompt"], "上游产出必须进入本任务的 prompt"
    assert "task_0" in seen["prompt"]


@pytest.mark.asyncio
async def test_missing_dependency_is_tolerated():
    """payload 里没有的上游（失败被跳过 / 被编辑删除）→ 走容错提示，不炸。"""
    task = _task(depends_on=["task_0"])
    seen: dict = {}

    class _CaptureLLM(_FakeLLM):
        async def ainvoke(self, messages, config=None):
            seen["prompt"] = "\n".join(str(m.content) for m in messages)
            return await super().ainvoke(messages, config=config)

    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch("agents.nodes.generic.filter_tools_for_binding", return_value=([], [])),
    ):
        result = await expert_worker_node(
            _branch_state(task, {"dependency_outputs": {}}),
            llm=_CaptureLLM([_FakeResponse("尽力作答")]),
        )

    assert "task_0" in seen["prompt"], "缺失依赖要如实告知模型"
    assert _outcome_of(result)["status"] == "completed"


@pytest.mark.asyncio
async def test_tool_loop_reentry_uses_branch_scratch():
    """工具循环重入：草稿末尾是 ToolMessage → 沿用草稿、不再绑工具、直接收尾。"""
    from langchain_core.messages import ToolMessage

    state = _branch_state(_task(), {"worker_started": True})
    state["worker_messages"] = [
        ToolMessage(content="工具结果", tool_call_id="call-1", name="calculator")
    ]

    class _TrackingLLM(_FakeLLM):
        async def ainvoke(self, messages, config=None):
            # 断言工具结果进入了上下文
            assert any(getattr(m, "tool_call_id", None) == "call-1" for m in messages)
            return await super().ainvoke(messages, config=config)

    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
    ):
        result = await expert_worker_node(state, llm=_TrackingLLM([_FakeResponse("最终回复")]))

    outcome = _outcome_of(result)
    assert outcome["status"] == "completed"
    assert outcome["output"] == "最终回复"


@pytest.mark.asyncio
async def test_task_started_ledger_row_written_only_on_first_entry(monkeypatch):
    """账本里的 task_started 只在首次进入时写一行（工具循环重入不再多写）。

    曾经的缺陷：账本写入在 is_first_entry guard **之外**，工具循环每重入一次就多写
    一行（实测一个任务两行，任务控制页时间线重复显示；聊天界面靠按 task_id 去重才
    没暴露）。思考面板改从账本重建后，重复行会直接变成重复步骤。

    C2 起「首次进入」由分支私有的 `worker_started` 表达（此前借 task_list 里的
    in_progress 标记——那是主图状态，分支已不再写它）。
    """
    import utils.async_task_queue as queue_module

    calls: list[str] = []

    def _spy(coro, label=None, **_kwargs):
        calls.append(label or "")
        # 吞掉协程，避免 "coroutine was never awaited" 噪音
        close = getattr(coro, "close", None)
        if callable(close):
            close()

    monkeypatch.setattr(queue_module, "spawn_background", _spy)

    from langchain_core.messages import ToolMessage

    # 1) 首次进入（worker_started 未设置）→ 写一行
    first_state = _branch_state(_task(), {"branch_context": {"run_id": "r-1", "thread_id": "th-1"}})
    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
    ):
        await expert_worker_node(first_state, llm=_FakeLLM([_FakeResponse("最终回复")]))
    first_entry_calls = [c for c in calls if c.startswith("run_event:task_started")]
    assert len(first_entry_calls) == 1, "首次进入必须写一行 task_started 到账本"

    # 2) 工具循环重入（worker_started=True）→ 不再写
    reentry_state = _branch_state(
        _task(), {"branch_context": {"run_id": "r-1", "thread_id": "th-1"}}
    )
    reentry_state["worker_started"] = True
    reentry_state["worker_messages"] = [
        ToolMessage(content="工具结果", tool_call_id="call-1", name="calculator")
    ]
    calls.clear()
    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
    ):
        await expert_worker_node(reentry_state, llm=_FakeLLM([_FakeResponse("最终回复")]))

    assert [c for c in calls if c.startswith("run_event:task_started")] == []


@pytest.mark.asyncio
async def test_failure_path_yields_failed_outcome():
    """LLM 抛异常：只产出本任务的失败产物（其余任务照常），不再依赖游标推进。"""
    task = _task()

    class _BoomLLM:
        def bind(self, **_kwargs):
            return _FakeBound(self)

        async def ainvoke(self, messages, config=None):
            raise RuntimeError("LLM 爆炸")

    with _patches():
        result = await expert_worker_node(_branch_state(task), llm=_BoomLLM())

    outcome = _outcome_of(result)
    assert outcome["status"] == "failed"
    assert "LLM" in outcome["error"]
    assert outcome["task_key"] == "task_1"
