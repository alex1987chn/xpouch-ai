"""计划形状三条转换链的一致性测试（批次 B4 验收）。

「改任一字段名只影响一处」靠的是：转换只发生在 `agents/plan_tasks.py`，
而这里把**每条链的字段集钉死**——任何一侧改名/漏字段都会红，而不是静默丢。

三条链：
  LLM 输出 → canonical（`build_plan_tasks`）
  canonical → 图状态 dict（`to_state_dict`；键名是历史遗留，故意不改）
  canonical → 事件 payload（`to_event_task_dict`，键集必须与 `TaskInfo` 一致）
  canonical → 落库 DTO（`to_subtask_create`）
"""

from __future__ import annotations

from typing import Any

import pytest

from agents.plan_tasks import PlanTask, attach_subtask_ids, build_plan_tasks
from event_types.events import TaskInfo
from models.enums import ExecutionMode
from schemas.task import SubTaskCreate


class _LlmTask:
    """commander.Task 的最小替身（只要 canonical 转换用到的字段）。"""

    def __init__(
        self, id: str, expert_type: str, description: str, depends_on=None, input_data=None
    ):
        self.id = id
        self.expert_type = expert_type
        self.description = description
        self.depends_on = depends_on or []
        self.input_data = input_data or {}
        self.execution_mode = ExecutionMode.SEQUENTIAL


def _llm_tasks() -> list[_LlmTask]:
    return [
        _LlmTask("task_1", "search", "检索资料"),
        _LlmTask("task_2", "writer", "写报告", depends_on=["task_1"]),
    ]


def _persisted_rows() -> list[dict[str, Any]]:
    return [
        {"id": "uuid-1", "sort_order": 0, "status": "pending"},
        {"id": "uuid-2", "sort_order": 1, "status": "pending"},
    ]


def _persisted_tasks():
    """落库后的 canonical 任务（事件/状态链的入口）。"""
    return attach_subtask_ids(build_plan_tasks(_llm_tasks()), _persisted_rows())


class TestLlmToCanonical:
    def test_maps_fields_and_ids(self):
        tasks = build_plan_tasks(_llm_tasks())

        assert [t.id for t in tasks] == ["task_1", "task_2"]
        assert all(t.subtask_id is None for t in tasks), "落库前不该有 subtask_id"
        assert tasks[1].depends_on == ["task_1"]

    def test_fills_missing_ids_by_position(self):
        tasks = build_plan_tasks([_LlmTask("", "search", "无 id"), _LlmTask("", "writer", "无 id")])

        assert [t.id for t in tasks] == ["task_0", "task_1"]

    def test_normalizes_index_style_dependencies(self):
        """LLM 有时写序号 ["0"]，有时写 ID ["task_0"] —— 统一成 ID。"""
        tasks = build_plan_tasks(
            [
                _LlmTask("task_0", "search", "a"),
                _LlmTask("task_1", "writer", "b", depends_on=["0"]),
                _LlmTask("task_2", "coder", "c", depends_on=["task_0"]),
            ]
        )

        assert tasks[1].depends_on == ["task_0"]
        assert tasks[2].depends_on == ["task_0"]

    def test_unknown_dependency_is_kept_as_is(self):
        """指向不存在任务的依赖不静默丢弃（交给下游的依赖清理去判断）。"""
        tasks = build_plan_tasks([_LlmTask("task_1", "writer", "b", depends_on=["ghost"])])

        assert tasks[0].depends_on == ["ghost"]


class TestCanonicalToStateDict:
    def test_key_set_is_pinned(self):
        """图状态的键名是历史遗留（id 存 UUID、task_id 存语义 ID）——改名属纯风险，
        所以**钉住**它：任何一侧改键都会在这里红，逼人想清楚。"""
        task = build_plan_tasks(_llm_tasks())[1]
        state = task.to_state_dict()

        assert set(state) == {
            "id",
            "task_id",
            "expert_type",
            "description",
            "input_data",
            "sort_order",
            "status",
            "depends_on",
            "output_result",
            "started_at",
            "completed_at",
        }
        # 两条身份线：id 是 DB UUID（落库前为 None），task_id 是 Commander 语义 ID
        assert state["task_id"] == "task_2"
        assert state["id"] is None
        assert state["depends_on"] == ["task_1"]
        assert state["output_result"] is None and state["started_at"] is None

    def test_subtask_id_lands_in_state_id_after_persist(self):
        tasks = attach_subtask_ids(build_plan_tasks(_llm_tasks()), _persisted_rows())
        state = tasks[0].to_state_dict()

        assert state["id"] == "uuid-1" and state["task_id"] == "task_1"


class TestCanonicalToEventPayload:
    def test_key_set_matches_task_info_model(self):
        """事件 payload 的键集必须正好是 TaskInfo 的字段——协议漂移在这一步就红。"""
        payload = _persisted_tasks()[0].to_event_task_dict()

        assert set(payload) == set(TaskInfo.model_fields), (
            "plan.created 的任务字段与 TaskInfo 不一致；"
            "改这里等于改线上协议，请同步 event_types/events.py"
        )

    def test_payload_survives_task_info_validation(self):
        """真实走一遍 TaskInfo 构造：字段名对不上会在这里抛。"""
        payload = _persisted_tasks()[1].to_event_task_dict()
        info = TaskInfo(**payload)

        assert info.expert_type == "writer" and info.depends_on == ["task_1"]

    def test_event_id_is_the_persisted_uuid(self):
        """事件的 task id = 落库 UUID（前端据此对齐计划卡片与任务事件）。"""
        assert _persisted_tasks()[0].to_event_task_dict()["id"] == "uuid-1"

    def test_calling_before_persist_fails_loudly(self):
        """落库前生成事件 payload 会发出 id=None —— 宁可炸在转换处。"""
        with pytest.raises(ValueError, match="尚未落库"):
            build_plan_tasks(_llm_tasks())[0].to_event_task_dict()


class TestCanonicalToDto:
    def test_dto_carries_both_identities(self):
        dto = build_plan_tasks(_llm_tasks())[1].to_subtask_create()

        assert isinstance(dto, SubTaskCreate)
        assert dto.task_description == "写报告"
        assert dto.depends_on == ["task_1"]
        # task_id = Commander 语义 ID：落库后供下游依赖匹配用
        assert dto.task_id == "task_2"

    def test_empty_dependencies_become_none(self):
        """空依赖落库为 None（与既有数据形态一致，避免 [] 与 NULL 两种空值并存）"""
        dto = build_plan_tasks(_llm_tasks())[0].to_subtask_create()

        assert dto.depends_on is None


class TestAttachSubtaskIds:
    def test_rejects_positional_mismatch(self):
        with pytest.raises(ValueError, match="不一致"):
            attach_subtask_ids(build_plan_tasks(_llm_tasks()), _persisted_rows()[:1])

    def test_takes_status_from_rows(self):
        rows = _persisted_rows()
        rows[0]["status"] = "running"
        tasks = attach_subtask_ids(build_plan_tasks(_llm_tasks()), rows)

        assert tasks[0].status == "running"


class TestPlanTaskModel:
    def test_defaults_are_serialisable_for_state(self):
        """canonical 模型本身不进图状态（状态里放的是 dict），但 dict 必须可 JSON 序列化。"""
        import json

        state = build_plan_tasks(_llm_tasks())[0].to_state_dict()
        json.dumps(state)  # 不抛即可

        assert isinstance(PlanTask.model_fields, dict)
