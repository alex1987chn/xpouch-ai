"""`_apply_updated_plan` 的计划合并语义（审批页编辑计划后的合并）。

回归背景：依赖清理曾用 db id（`id`）建「保留集合」，而 `depends_on` 里存的是
commander 语义 id（`task_id`）——两者不同源，交集恒为空，于是**用户一旦编辑
计划，所有任务的依赖都会被清空**。后果是下游任务失去上游产出的上下文注入
（generic 读 `depends_on` 拼接上游结果），任务质量静默下降。

这里同时锁住合并语义的其余部分：已完成任务整条保留、依赖清理本身仍然有效
（指向被删除任务的依赖要剔除）。

C2（2026-09-13）：不再重算 `current_task_index`——游标已删除，「下一个跑哪个」统一由
`agents/plan_waves.py` 按依赖判定。所以本文件不再断言索引，改为断言「合并后的计划
让判定层能正确选出下一个任务」（这比断言一个数字更接近真实契约）。
"""

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


async def _apply(current: list[dict], updated: list[dict]) -> dict:
    service = StreamService.__new__(StreamService)  # 不触碰 db
    graph = _FakeGraph({"task_list": current, "expert_results": []})
    await service._apply_updated_plan(graph, {}, updated)
    assert graph.updated is not None, "必须写回状态"
    return graph.updated


def _by_key(task_list: list[dict]) -> dict[str, dict]:
    return {t["task_id"]: t for t in task_list}


class TestDependencyPreserved:
    """核心回归：编辑计划后依赖不得被清空。"""

    async def test_kept_dependency_survives_frontend_taskinfo_shape(self):
        """真实前端回传是 TaskInfo 形态：id=db uuid、**没有 task_id 字段**、
        depends_on=语义 id。此前 kept_task_ids 对这种形态全落回 uuid，
        语义依赖 ∩ uuid 集合恒空 → 依赖被清空 → 下游失去上游注入
        （实测 writer 报「task_1 检索报告缺失」）。"""
        current = [
            _task("task_1", db_id="uuid-1", status="completed"),
            _task("task_2", db_id="uuid-2", deps=["task_1"]),
        ]
        updated = [
            {
                "id": "uuid-1",
                "expert_type": "search",
                "description": "d1",
                "sort_order": 0,
                "status": "completed",
                "depends_on": [],
            },
            {
                "id": "uuid-2",
                "expert_type": "writer",
                "description": "d2",
                "sort_order": 1,
                "status": "pending",
                "depends_on": ["task_1"],
            },
        ]

        merged = _by_key((await _apply(current, updated))["task_list"])

        assert merged["task_2"]["depends_on"] == ["task_1"], (
            "前端 TaskInfo 形态（无 task_id 字段）的语义依赖必须经 uuid→语义映射后保留"
        )

    async def test_kept_dependency_survives(self):
        current = [_task("task_1", status="completed"), _task("task_2", deps=["task_1"])]
        updated = [_task("task_1", status="completed"), _task("task_2", deps=["task_1"])]

        merged = _by_key((await _apply(current, updated))["task_list"])

        assert merged["task_2"]["depends_on"] == ["task_1"], (
            "依赖引用的 commander id 与保留集合同源时必须保留"
        )

    async def test_dependency_on_removed_task_is_dropped(self):
        """依赖清理本身仍要有效：指向被删任务的依赖应剔除。"""
        current = [_task("task_1"), _task("task_2"), _task("task_3", deps=["task_1", "task_2"])]
        updated = [_task("task_1"), _task("task_3", deps=["task_1", "task_2"])]  # 删掉 task_2

        merged = _by_key((await _apply(current, updated))["task_list"])

        assert merged["task_3"]["depends_on"] == ["task_1"]

    async def test_all_deps_dropped_becomes_none(self):
        current = [_task("task_1"), _task("task_2", deps=["task_1"])]
        updated = [_task("task_2", deps=["task_1"])]  # task_1 被删

        merged = _by_key((await _apply(current, updated))["task_list"])

        assert merged["task_2"]["depends_on"] is None


class TestCompletedTaskPreserved:
    async def test_completed_task_keeps_output_and_status(self):
        current = [
            {
                **_task("task_1", status="completed"),
                "output_result": "上游产出，必须保留",
            },
            _task("task_2", deps=["task_1"]),
        ]
        # 前端提交时把已完成任务的 status 写回 pending（模拟朴素客户端）
        updated = [_task("task_1"), _task("task_2", deps=["task_1"])]

        merged = _by_key((await _apply(current, updated))["task_list"])

        assert merged["task_1"]["status"] == "completed"
        assert merged["task_1"]["output_result"] == "上游产出，必须保留"

    async def test_next_task_selected_by_wave_decision(self):
        """合并后的计划交给判定层：下一个该跑谁由依赖算出，不再靠游标。"""
        from agents.plan_waves import select_wave

        current = [_task("task_1", status="completed"), _task("task_2"), _task("task_3")]
        updated = [_task("task_1"), _task("task_2"), _task("task_3")]

        merged = (await _apply(current, updated))["task_list"]

        assert select_wave(merged, max_concurrency=1) == ["task_2"], "串行下取第一个就绪任务"
        assert "current_task_index" not in await _apply(current, updated), (
            "游标已删除：留着会与波次判定形成两套「下一个是谁」"
        )

    async def test_removed_upstream_leaves_downstream_runnable(self):
        """编辑时删掉上游 → 下游依赖被清理成悬空 → 它必须仍然可执行。

        这是「删任务」这条编辑路径与波次判定层的接口：悬空依赖按已满足处理，
        否则用户删掉一个上游就会让整条下游链永远卡在 pending（判定层见
        `agents/plan_waves.py` 的悬空容忍）。
        """
        from agents.plan_waves import plan_wave_decision

        current = [_task("task_1"), _task("task_2", deps=["task_1"])]
        updated = [_task("task_2", deps=["task_1"])]  # task_1 被删

        merged = (await _apply(current, updated))["task_list"]

        decision = plan_wave_decision(merged)
        assert decision.ready == ["task_2"]
        assert decision.blocked == [] and decision.deadlocked == []
        assert merged[0]["depends_on"] is None, "指向已删任务的依赖在合并时被剔除"

    async def test_only_plan_state_is_written(self):
        """计划合并只写 task_list/expert_results：消息 id 贯通已随 resume
        message_id 链拆除（聚合消息 id 由 run 创建时的 state 承载，见
        test_transform_langgraph_event），此处不得再写。"""
        current = [_task("task_1"), _task("task_2")]
        updated = [_task("task_1"), _task("task_2")]

        state = await _apply(current, updated)

        assert set(state.keys()) == {"task_list", "expert_results"}

    async def test_no_human_message_is_injected(self):
        """不再伪造 HumanMessage：续跑由 Command(resume=) 触发。"""
        current = [_task("task_1")]
        updated = [_task("task_1")]

        state = await _apply(current, updated)

        assert "messages" not in state, "静态中断时代的伪造消息注入必须已移除"


class TestPostRevisionUuidPlan:
    """修订后批准的真实形状（2026-10-03 e68b5a40 事故回归）。

    修订整行替换 subtask 后，前端从 GET /runs/{id}/plan 轮询到新计划
    （id=新行 uuid、depends_on=uuid）并原样回传。此时图 task_list 还揣着
    修订前的旧 uuid，current_task_map 必然全部 miss——语义上这是「按 DB
    新真相整表替换」。要钉住的三件事：
    1. 新 uuid 成为任务 id（保存路径按它对 SubTask 行，语义 id 会全灭）
    2. uuid 依赖线必须保留（kept 集合回退到 payload id，uuid 依赖 ⊆ uuid id）
    3. 合并结果可被波次判定消费（依赖解析按 task_key 回退 id）
    """

    async def test_revised_uuid_plan_replaces_identity_and_keeps_deps(self):
        current = [  # 修订前的图状态：旧 uuid（修订已把这些行删了）
            _task("task_1", db_id="old-uuid-1"),
            _task("task_2", db_id="old-uuid-2", deps=["task_1"]),
        ]
        updated = [  # 修订后批准回传：新 uuid id + uuid 依赖（GET /plan 轮询产物）
            {
                "id": "new-uuid-1",
                "expert_type": "writer",
                "description": "d1",
                "sort_order": 0,
                "depends_on": [],
            },
            {
                "id": "new-uuid-2",
                "expert_type": "coder",
                "description": "d2",
                "sort_order": 1,
                "depends_on": ["new-uuid-1"],
            },
        ]

        merged_list = (await _apply(current, updated))["task_list"]
        by_id = {t["id"]: t for t in merged_list}

        assert set(by_id) == {"new-uuid-1", "new-uuid-2"}, (
            "修订后批准 = 按 DB 新行整表替换：任务 id 必须是新 uuid（db 身份），"
            "不得混入旧 uuid 或位置号"
        )
        assert by_id["new-uuid-2"]["depends_on"] == ["new-uuid-1"], (
            "uuid 依赖线必须保留——被剪断时下游拿不到上游产出注入"
        )

    async def test_merged_uuid_plan_feeds_wave_decision(self):
        """合并结果交给判定层：uuid 命名空间下波次与依赖解析仍然成立。"""
        from agents.plan_waves import plan_wave_decision

        current = [_task("task_1", db_id="old-uuid-1")]
        updated = [
            {
                "id": "u1",
                "expert_type": "writer",
                "description": "d1",
                "sort_order": 0,
                "depends_on": [],
            },
            {
                "id": "u2",
                "expert_type": "coder",
                "description": "d2",
                "sort_order": 1,
                "depends_on": ["u1"],
            },
        ]

        merged_list = (await _apply(current, updated))["task_list"]

        decision = plan_wave_decision(merged_list)
        assert decision.ready == ["u1"], "uuid 命名空间下首波应选出无依赖任务"
        assert decision.blocked == [] and decision.deadlocked == []
