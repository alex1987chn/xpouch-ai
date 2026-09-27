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
from utils.title_extract import artifact_title_from_output  # noqa: E402


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
async def test_tool_loop_reentry_rebinds_tools_and_keeps_scratch():
    """工具循环重入（评审 H3）：草稿末尾是 ToolMessage → 沿用草稿、**重新绑工具**。

    多步工具链（search → read → 计算）依赖每轮都能再发起工具调用；单轮时代的
    「重入不再绑工具」在这里被改回多轮。循环有界性由熔断守卫 + recursion_limit 兜底
    （见 test_guard_tripped_forces_toolless_finish）。
    """
    from langchain_core.messages import ToolMessage

    state = _branch_state(_task(), {"worker_started": True})
    state["worker_messages"] = [
        ToolMessage(content="工具结果", tool_call_id="call-1", name="calculator")
    ]

    bound_log: list[list] = []

    class _RecordingBound(_FakeBound):
        def bind_tools(self, tools):
            bound_log.append(list(tools))
            return self

    class _RecordingLLM(_FakeLLM):
        def bind(self, **_kwargs):
            return _RecordingBound(self)

        async def ainvoke(self, messages, config=None):
            # 断言工具结果进入了上下文
            assert any(getattr(m, "tool_call_id", None) == "call-1" for m in messages)
            return await super().ainvoke(messages, config=config)

    sentinel_tool = object()
    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch(
            "agents.nodes.generic.filter_tools_for_binding",
            return_value=([sentinel_tool], []),
        ),
    ):
        result = await expert_worker_node(state, llm=_RecordingLLM([_FakeResponse("最终回复")]))

    # 重入轮绑上了工具（含治理过滤后的工具集）
    assert bound_log and sentinel_tool in bound_log[0], "工具重入必须重新绑定工具（多轮循环）"
    outcome = _outcome_of(result)
    assert outcome["status"] == "completed"
    assert outcome["output"] == "最终回复"


@pytest.mark.asyncio
async def test_guard_tripped_forces_toolless_finish():
    """熔断后转无工具收尾（评审 H3）：不再绑工具，且注入熔断收尾指令。

    用「同一工具连续调用 4 次」触发 should_trip_tool_loop_guard 的连续同工具规则。
    """
    from langchain_core.messages import AIMessage, ToolMessage

    state = _branch_state(_task(), {"worker_started": True})
    # 构造会触发熔断的草稿：同一工具连续 4 轮调用
    scratch: list = []
    for i in range(4):
        scratch.append(
            AIMessage(
                content="",
                tool_calls=[{"name": "web_search", "args": {"q": f"q{i}"}, "id": f"c{i}"}],
            )
        )
        scratch.append(ToolMessage(content=f"结果{i}", tool_call_id=f"c{i}", name="web_search"))
    state["worker_messages"] = scratch

    bind_calls: list[list] = []

    class _NoToolsBound(_FakeBound):
        def bind_tools(self, tools):
            bind_calls.append(list(tools))
            return self

    class _FinishLLM(_FakeLLM):
        def bind(self, **_kwargs):
            return _NoToolsBound(self)

    seen_prompts: list[list] = []

    class _CaptureLLM(_FinishLLM):
        async def ainvoke(self, messages, config=None):
            seen_prompts.append(list(messages))
            return await super().ainvoke(messages, config=config)

    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch(
            "agents.nodes.generic.filter_tools_for_binding",
            return_value=([object()], []),
        ),
    ):
        result = await expert_worker_node(
            state, llm=_CaptureLLM([_FakeResponse("基于已有信息的收尾答复")])
        )

    # 熔断轮不得再绑工具
    assert bind_calls == [], "熔断后仍绑了工具"
    # 注入了熔断收尾指令
    assert any("熔断" in str(getattr(m, "content", "")) for m in seen_prompts[-1])
    outcome = _outcome_of(result)
    assert outcome["status"] == "completed"
    assert outcome["output"] == "基于已有信息的收尾答复"


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

    # 工具治理覆盖是**读库**的（tool_policy_service.get_overrides）——同文件其余用例
    # 都桩掉它，这里漏了。漏掉时本地「能过」纯属侥幸：本地测试库（xpouch_test）迁移过、
    # 有 toolpolicy 表，而 CI 的 Postgres 是空库，于是 DB 异常先于 LLM 异常抛出，
    # 失败原因变成 "relation toolpolicy does not exist"，断言 'LLM' 就挂了。
    with (
        _patches(),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch("agents.nodes.generic.filter_tools_for_binding", return_value=([], [])),
    ):
        result = await expert_worker_node(_branch_state(task), llm=_BoomLLM())

    outcome = _outcome_of(result)
    assert outcome["status"] == "failed"
    assert "LLM" in outcome["error"]
    assert outcome["task_key"] == "task_1"


@pytest.mark.asyncio
async def test_config_load_failure_yields_failed_outcome():
    """配置获取（内含 DB 会话）抛异常：只失败本任务，异常不得冲出节点（评审 H1）。

    此前配置加载段在任务级 try 之外——本地测试因 _CONFIG_PATCHES 全量 mock 配置
    而永远测不到这条真实路径，DB 抖动会炸掉整个 superstep 并连带同波兄弟任务。
    """

    def _raise_db(_expert_type):
        raise RuntimeError("DB 抖动")

    task = _task()
    with (
        patch.multiple(
            sys.modules["agents.nodes.generic"],
            _generic_expert_cache={},
            get_expert_config_cached=_raise_db,
        ),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch("agents.nodes.generic.filter_tools_for_binding", return_value=([], [])),
    ):
        result = await expert_worker_node(_branch_state(task), llm=_FakeLLM([]))

    outcome = _outcome_of(result)
    assert outcome["status"] == "failed"
    assert "Failed to load expert config" in outcome["error"]
    assert outcome["task_key"] == "task_1"


class TestArtifactTitleExtraction:
    """产物标题提取规则（单一实现在 utils.title_extract，generic 落库与
    专家消息 summary 共用；画廊/预览/下载名/消息横条都读它的产出）。

    规则：优先第一个 markdown 标题行；无标题时首行仅当短（≤40）且无句读
    才采用——模型过渡句（完整长句）必须兜底，否则画廊里会出现
    "I have sufficient information…" 这类废标题（E2E 实抓）。
    """

    def test_prefers_first_markdown_heading(self):
        title = artifact_title_from_output(
            "过渡句……\n\n# Tauri 2 插件生态调研总结\n\n正文", "搜索专家结果"
        )
        assert title == "Tauri 2 插件生态调研总结"

    def test_transitional_first_line_without_heading_falls_back(self):
        title = artifact_title_from_output(
            "I have sufficient information. Let me compile the report.\n\n正文无标题",
            "搜索专家结果",
        )
        assert title == "搜索专家结果"

    def test_short_punct_free_first_line_is_used(self):
        title = artifact_title_from_output("**部署手册**\n正文", "写作专家结果")
        assert title == "部署手册"

    def test_empty_output_falls_back(self):
        assert artifact_title_from_output("\n  \n", "写作专家结果") == "写作专家结果"
