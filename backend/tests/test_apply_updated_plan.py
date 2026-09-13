"""`_apply_updated_plan` 的计划合并语义（审批页编辑计划后的合并）。

回归背景：依赖清理曾用 db id（`id`）建「保留集合」，而 `depends_on` 里存的是
commander 语义 id（`task_id`）——两者不同源，交集恒为空，于是**用户一旦编辑
计划，所有任务的依赖都会被清空**。后果是下游任务失去上游产出的上下文注入
（generic 读 `depends_on` 拼接上游结果），任务质量静默下降。

这里同时锁住合并语义的其余部分：已完成任务整条保留、索引重算、依赖清理本身
仍然有效（指向被删除任务的依赖要剔除）。
"""

import asyncio
from types import SimpleNamespace

from services.chat.stream_service import StreamService


class _FakeGraph:
    """只实现 _apply_updated_plan 用到的两个接口。"""

    def __init__(self, values: dict):
        self._values = values
        self.updated: dict | None = None

    async def aget_state(self, config):  # noqa: ARG002
        return SimpleNamespace(values=self._values)

    async def aupdate_state(self, config, update):  # noqa: ARG002
        self.updated = update


def _task(task_id: str, *, db_id: str | None = None, deps=None, status="pending", desc=""):
    return {
        "id": db_id or f"uuid-{task_id}",
        "task_id": task_id,
        "expert_type": "researcher",
        "description": desc or f"任务 {task_id}",
        "sort_order": 0,
        "status": status,
        "depends_on": list(deps or []),
        "output_result": None,
    }


def _apply(current: list[dict], updated: list[dict]) -> dict:
    service = StreamService.__new__(StreamService)  # 不触碰 db
    graph = _FakeGraph({"task_list": current, "expert_results": []})
    asyncio.run(service._apply_updated_plan(graph, {}, updated, message_id="m1"))
    assert graph.updated is not None, "必须写回状态"
    return graph.updated


def _by_key(task_list: list[dict]) -> dict[str, dict]:
    return {t["task_id"]: t for t in task_list}


class TestDependencyPreserved:
    """核心回归：编辑计划后依赖不得被清空。"""

    def test_kept_dependency_survives(self):
        current = [_task("task_1", status="completed"), _task("task_2", deps=["task_1"])]
        updated = [_task("task_1", status="completed"), _task("task_2", deps=["task_1"])]

        merged = _by_key(_apply(current, updated)["task_list"])

        assert merged["task_2"]["depends_on"] == ["task_1"], (
            "依赖引用的 commander id 与保留集合同源时必须保留"
        )

    def test_dependency_on_removed_task_is_dropped(self):
        """依赖清理本身仍要有效：指向被删任务的依赖应剔除。"""
        current = [_task("task_1"), _task("task_2"), _task("task_3", deps=["task_1", "task_2"])]
        updated = [_task("task_1"), _task("task_3", deps=["task_1", "task_2"])]  # 删掉 task_2

        merged = _by_key(_apply(current, updated)["task_list"])

        assert merged["task_3"]["depends_on"] == ["task_1"]

    def test_all_deps_dropped_becomes_none(self):
        current = [_task("task_1"), _task("task_2", deps=["task_1"])]
        updated = [_task("task_2", deps=["task_1"])]  # task_1 被删

        merged = _by_key(_apply(current, updated)["task_list"])

        assert merged["task_2"]["depends_on"] is None


class TestCompletedTaskPreserved:
    def test_completed_task_keeps_output_and_status(self):
        current = [
            {
                **_task("task_1", status="completed"),
                "output_result": "上游产出，必须保留",
            },
            _task("task_2", deps=["task_1"]),
        ]
        # 前端提交时把已完成任务的 status 写回 pending（模拟朴素客户端）
        updated = [_task("task_1"), _task("task_2", deps=["task_1"])]

        merged = _by_key(_apply(current, updated)["task_list"])

        assert merged["task_1"]["status"] == "completed"
        assert merged["task_1"]["output_result"] == "上游产出，必须保留"

    def test_index_points_to_first_unfinished(self):
        current = [_task("task_1", status="completed"), _task("task_2"), _task("task_3")]
        updated = [_task("task_1"), _task("task_2"), _task("task_3")]

        state = _apply(current, updated)

        assert state["current_task_index"] == 1, "应指向第一个未完成任务"

    def test_message_id_propagates(self):
        current = [_task("task_1"), _task("task_2")]
        updated = [_task("task_1"), _task("task_2")]

        state = _apply(current, updated)

        assert state["message_id"] == "m1"

    def test_no_human_message_is_injected(self):
        """不再伪造 HumanMessage：续跑由 Command(resume=) 触发。"""
        current = [_task("task_1")]
        updated = [_task("task_1")]

        state = _apply(current, updated)

        assert "messages" not in state, "静态中断时代的伪造消息注入必须已移除"
