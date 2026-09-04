"""Commander 节点行为测试（P3-1 安全网）。

覆盖：无 recent_artifacts 时不注入产物清单、有则注入（兜底追加路径）、
依赖索引→ID 转换、LLM 无 id 自动补齐。fake LLM 注入（llm 工厂 patch），不经真实 DB。
"""

import sys
from pathlib import Path
from unittest.mock import patch

import pytest  # noqa: E402
from langchain_core.messages import HumanMessage  # noqa: E402

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.nodes.commander import commander_node  # noqa: E402

COMMANDER_CONFIG = {
    "name": "Commander",
    "system_prompt": "你是规划者。任务: {user_query} 专家: {dynamic_expert_list}",
    "model": "deepseek-v4-flash",
    "temperature": 0.3,
}

_PROVIDERS = {
    "providers": {"deepseek": {"content_mode": "string"}},
    "models": {
        "deepseek-v4-flash": {
            "provider": "deepseek",
            "model": "deepseek-v4-flash",
            "temperature": 0.6,
        }
    },
}


class _FakeResponse:
    def __init__(self, content: str):
        self.content = content


class _FakeBound:
    def __init__(self, llm):
        self._llm = llm

    def bind(self, **_kwargs):
        return self

    async def ainvoke(self, messages, config=None):
        return await self._llm.ainvoke(messages, config=config)


class _FakeLLM:
    def __init__(self, json_plan: str):
        self._json = json_plan

    def bind(self, **_kwargs):
        return _FakeBound(self)

    async def ainvoke(self, messages, config=None):
        return _FakeResponse(self._json)


def _plan_json(tasks):
    import json

    return json.dumps({"strategy": "测试策略", "estimated_steps": len(tasks), "tasks": tasks})


def _base_state(extra=None):
    state = {
        "messages": [HumanMessage(content="做一个网站")],
        # 提供合法 thread_id：task_list 由 DB 回读构造，None 会导致任务列表恒空
        # （已知设计缺口：无 thread 的预览场景 task_list 为空，见测试文件尾注）
        "thread_id": "thread-test-1",
        "run_id": None,
        "recent_artifacts": [],
        "preview_execution_plan_id": "plan-preview-1",  # 跳过 plan.started 发射
    }
    if extra:
        state.update(extra)
    return state


def _stub_db_stack(stack):
    """stub 掉 commander 的 DB 持久化路径（延迟导入源模块）。

    fake_subtasks 模拟 ORM 对象（属性访问，与 get_subtasks_by_execution_plan
    返回的 SubTask 实例一致）；按计划的任务数动态生成。
    """
    from types import SimpleNamespace

    def _fake_get_or_create(**kw):
        plan = _FakePlan()
        plan.task_count = len(kw.get("subtasks_data") or [])
        return plan, False

    def _fake_get_subtasks(_db, _plan_id):
        # 依据 commander 最后一次传给 get_or_create 的 subtasks_data 数量生成
        count = getattr(_fake_get_or_create, "last_count", 1)
        return [
            SimpleNamespace(
                id=f"st-{i}",
                expert_type="coder",
                task_description=f"任务{i}",
                input_data={},
                sort_order=i,
                status="pending",
            )
            for i in range(count)
        ]

    def _wrapped_get_or_create(**kw):
        result = _fake_get_or_create(**kw)
        _fake_get_or_create.last_count = len(kw.get("subtasks_data") or [])
        return result

    stack.enter_context(
        patch(
            "agents.services.task_manager.get_or_create_execution_plan",
            side_effect=_wrapped_get_or_create,
        )
    )
    stack.enter_context(
        patch(
            "crud.execution_plan.get_subtasks_by_execution_plan",
            side_effect=_fake_get_subtasks,
        )
    )


class _FakePlan:
    id = "plan-1"


def _patches(llm):
    """patch 模块级依赖：LLM 工厂、provider 配置、专家列表。"""
    import contextlib

    import agents.nodes.commander as mod

    stack = contextlib.ExitStack()
    for p in (
        patch.object(mod, "_commander_config_cache", {"commander": COMMANDER_CONFIG}),
        patch.object(mod, "get_llm_instance", return_value=llm),
        # 函数内延迟导入：patch 源模块
        patch(
            "providers_config.get_model_config",
            lambda m: {"provider": "deepseek", "model": m, "temperature": 0.6},
        ),
        patch("providers_config.load_providers_config", lambda: _PROVIDERS),
    ):
        stack.enter_context(p)
    _stub_db_stack(stack)
    return stack


@pytest.mark.asyncio
async def test_generates_plan_without_artifacts_section():
    captured_prompts: list = []

    class _CaptureLLM(_FakeLLM):
        async def ainvoke(self, messages, config=None):
            captured_prompts.append(messages[0].content)
            return await super().ainvoke(messages, config=config)

    with _patches(
        _CaptureLLM(
            _plan_json(
                [
                    {
                        "id": "task_0",
                        "expert_type": "coder",
                        "description": "写代码",
                        "dependencies": [],
                    }
                ]
            )
        )
    ):
        result = await commander_node(_base_state())

    assert result["current_task_index"] == 0
    assert result["strategy"] == "测试策略"
    assert len(result["task_list"]) == 1
    assert result["task_list"][0]["expert_type"] == "coder"
    # 无产物 → 提示词不含产物清单段
    assert captured_prompts, "LLM 未被调用"
    assert "本会话已有产物" not in captured_prompts[0]


@pytest.mark.asyncio
async def test_injects_recent_artifacts_into_prompt():
    captured_prompts: list = []

    class _CaptureLLM(_FakeLLM):
        async def ainvoke(self, messages, config=None):
            captured_prompts.append(messages[0].content)
            return await super().ainvoke(messages, config=config)

    capture = _CaptureLLM(
        _plan_json(
            [{"id": "task_0", "expert_type": "coder", "description": "改图", "dependencies": []}]
        )
    )
    state = _base_state(
        extra={
            "recent_artifacts": [
                {
                    "id": "art-1",
                    "type": "markdown",
                    "title": "流程图",
                    "expert_type": "coder",
                    "content_head": "flowchart TD",
                }
            ]
        }
    )

    with _patches(capture):
        result = await commander_node(state)

    assert "本会话已有产物" in captured_prompts[0]
    assert "art-1" in captured_prompts[0]
    assert result["task_list"][0]["expert_type"] == "coder"


@pytest.mark.asyncio
async def test_dependency_indexes_converted_to_ids():
    """LLM 返回数字索引依赖 → 转换为任务 ID。"""
    llm = _FakeLLM(
        _plan_json(
            [
                {
                    "id": "task_0",
                    "expert_type": "researcher",
                    "description": "调研",
                    "dependencies": [],
                },
                {
                    "id": "task_1",
                    "expert_type": "writer",
                    "description": "写作",
                    "dependencies": ["0"],
                },
            ]
        )
    )

    with _patches(llm):
        result = await commander_node(_base_state())

    assert result["task_list"][1]["depends_on"] == ["task_0"]


@pytest.mark.asyncio
async def test_missing_task_ids_auto_generated():
    """LLM 未生成 id → 自动补齐 task_{idx}。"""
    llm = _FakeLLM(
        _plan_json(
            [
                {"expert_type": "researcher", "description": "调研", "dependencies": []},
            ]
        )
    )

    with _patches(llm):
        result = await commander_node(_base_state())

    # task_list[].id = DB subtask id；Commander 生成的 id 落在 task_id 字段
    assert result["task_list"][0]["task_id"] == "task_0"
