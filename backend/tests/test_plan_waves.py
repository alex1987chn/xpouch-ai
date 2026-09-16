"""波次规划（agents/plan_waves.py）的单元测试。

这是并行的**判定层**：给定计划（依赖 DAG + 各任务状态），算出「本轮能跑哪些」。
它与执行器解耦、纯函数无 IO，所以能用最便宜的方式把并行语义钉死——包括
「默认串行（并发上限 1）时行为与现在完全一致」这条不改变现有业务的保证。
"""

from agents.plan_waves import (
    _COMPLETED,
    _TERMINAL_FAILURE,
    _task_key,
    plan_wave_decision,
    select_wave,
)


# 断言便捷视图：原为生产模块的导出包装，生产侧零消费后下沉到测试文件
# （语义与 WaveDecision 字段一一对应；completed/failed 两个集合视图同理）
def ready_task_ids(task_list):
    return plan_wave_decision(task_list).ready


def blocked_task_ids(task_list):
    return plan_wave_decision(task_list).blocked


def deadlocked_task_ids(task_list):
    return plan_wave_decision(task_list).deadlocked


def is_plan_finished(task_list):
    return plan_wave_decision(task_list).finished


def completed_task_ids(task_list):
    return {_task_key(t) for t in task_list if t.get("status") == _COMPLETED}


def failed_task_ids(task_list):
    return {_task_key(t) for t in task_list if t.get("status") in _TERMINAL_FAILURE}


def _task(task_id: str, *, deps: list[str] | None = None, status: str = "pending", order: int = 0):
    """构造与图状态同形的任务字典。

    注意 `id` 与 `task_id` 是两个身份：`id` 是 db uuid、`task_id` 是 commander
    语义 id，而 `depends_on` 引用的是后者——这正是本模块要守住的区分。
    """
    return {
        "id": f"uuid-{task_id}",
        "task_id": task_id,
        "expert_type": "researcher",
        "description": f"任务 {task_id}",
        "sort_order": order,
        "status": status,
        "depends_on": deps or [],
        "output_result": None,
    }


class TestCompletedSet:
    def test_uses_commander_id_not_db_id(self):
        tasks = [_task("task_1", status="completed")]
        assert completed_task_ids(tasks) == {"task_1"}, "依赖空间用 commander id"

    def test_only_completed_counts(self):
        tasks = [
            _task("task_1", status="completed"),
            _task("task_2", status="failed"),
            _task("task_3", status="pending"),
        ]
        assert completed_task_ids(tasks) == {"task_1"}


class TestReadySet:
    def test_no_deps_are_ready_immediately(self):
        tasks = [_task("task_1", order=0), _task("task_2", order=1)]
        assert ready_task_ids(tasks) == ["task_1", "task_2"]

    def test_dependent_task_waits_for_upstream(self):
        tasks = [
            _task("task_1", order=0),
            _task("task_2", deps=["task_1"], order=1),
        ]
        assert ready_task_ids(tasks) == ["task_1"], "下游在上游完成前不就绪"

    def test_dependent_becomes_ready_after_upstream_completes(self):
        tasks = [
            _task("task_1", status="completed", order=0),
            _task("task_2", deps=["task_1"], order=1),
        ]
        assert ready_task_ids(tasks) == ["task_2"]

    def test_chain_only_advances_one_step(self):
        """链式计划（最常见的形状）：任一时点只有一个就绪任务。"""
        tasks = [
            _task("task_1", order=0),
            _task("task_2", deps=["task_1"], order=1),
            _task("task_3", deps=["task_2"], order=2),
        ]
        assert ready_task_ids(tasks) == ["task_1"]

    def test_wide_layer_is_all_ready_after_fan_in(self):
        """菱形：task_1 → (2a,2b,2c) → task_4。扇出层三个同时就绪。"""
        tasks = [
            _task("task_1", status="completed", order=0),
            _task("task_2a", deps=["task_1"], order=1),
            _task("task_2b", deps=["task_1"], order=2),
            _task("task_2c", deps=["task_1"], order=3),
            _task("task_4", deps=["task_2a", "task_2b", "task_2c"], order=4),
        ]
        assert ready_task_ids(tasks) == ["task_2a", "task_2b", "task_2c"]
        assert "task_4" not in ready_task_ids(tasks), "扇入任务须等全部上游"

    def test_respects_sort_order(self):
        tasks = [_task("task_b", order=5), _task("task_a", order=1)]
        assert ready_task_ids(tasks) == ["task_a", "task_b"]

    def test_completed_and_running_are_not_ready(self):
        tasks = [
            _task("task_1", status="completed"),
            _task("task_2", status="running"),
        ]
        assert ready_task_ids(tasks) == []


class TestBlockedSet:
    def test_pending_with_failed_dep_is_blocked(self):
        tasks = [
            _task("task_1", status="failed"),
            _task("task_2", deps=["task_1"]),
        ]
        assert blocked_task_ids(tasks) == ["task_2"]

    def test_cancelled_dep_also_blocks(self):
        tasks = [
            _task("task_1", status="cancelled"),
            _task("task_2", deps=["task_1"]),
        ]
        assert blocked_task_ids(tasks) == ["task_2"]

    def test_transitive_block_is_detected(self):
        """上游失败 → 下游阻塞，**且阻塞沿依赖链传递**。

        2026-09-13（C2）改为传递闭包：此前只判直接依赖，更下游会停在
        「既不就绪也不阻塞」的假等待态，执行器要么空转、要么靠静默忽略蒙过去。
        """
        tasks = [
            _task("task_1", status="failed"),
            _task("task_2", deps=["task_1"]),
            _task("task_3", deps=["task_2"]),
        ]
        assert blocked_task_ids(tasks) == ["task_2", "task_3"]

    def test_healthy_plan_has_no_blocked(self):
        tasks = [_task("task_1"), _task("task_2", deps=["task_1"])]
        assert blocked_task_ids(tasks) == []


class TestDanglingDependency:
    """依赖指向计划里不存在的任务 = 已删除的上游，按「已满足」处理。"""

    def test_dangling_dep_does_not_block(self):
        tasks = [_task("task_2", deps=["task_1_deleted"])]
        assert ready_task_ids(tasks) == ["task_2"]
        assert blocked_task_ids(tasks) == []

    def test_dangling_dep_is_not_deadlock(self):
        tasks = [_task("task_2", deps=["task_1_deleted"])]
        assert plan_wave_decision(tasks).deadlocked == []

    def test_dangling_and_real_dep_mixed(self):
        """真实上游没完成时仍然等待——悬空容忍不能变成「依赖全部失效」。"""
        tasks = [
            _task("task_1", order=0),
            _task("task_2", deps=["task_1", "task_1_deleted"], order=1),
        ]
        assert ready_task_ids(tasks) == ["task_1"]


class TestDeadlock:
    """依赖成环：必须被显式归类，否则判定层留下永远 pending 的任务。"""

    def test_two_cycle_is_deadlocked(self):
        tasks = [
            _task("task_a", deps=["task_b"]),
            _task("task_b", deps=["task_a"]),
        ]
        decision = plan_wave_decision(tasks)
        assert decision.ready == []
        assert decision.blocked == []
        assert sorted(decision.deadlocked) == ["task_a", "task_b"]
        assert sorted(deadlocked_task_ids(tasks)) == ["task_a", "task_b"]
        assert decision.finished is True, "成环即无救，必须判定为结束而不是空转"

    def test_downstream_of_cycle_is_deadlocked(self):
        tasks = [
            _task("task_a", deps=["task_b"]),
            _task("task_b", deps=["task_a"]),
            _task("task_c", deps=["task_a"], order=2),
        ]
        decision = plan_wave_decision(tasks)
        assert sorted(decision.deadlocked) == ["task_a", "task_b", "task_c"]

    def test_self_dependency_is_deadlocked(self):
        tasks = [_task("task_a", deps=["task_a"])]
        assert plan_wave_decision(tasks).deadlocked == ["task_a"]

    def test_cycle_does_not_stop_independent_tasks(self):
        """环外的任务照常就绪——不能因为一处成环就整轮不跑。"""
        tasks = [
            _task("task_a", deps=["task_b"], order=0),
            _task("task_b", deps=["task_a"], order=1),
            _task("task_free", order=2),
        ]
        decision = plan_wave_decision(tasks)
        assert decision.ready == ["task_free"]
        assert decision.finished is False


class TestWaitingIsNotDeadlock:
    """「在等上游」与「成环」必须分开——判错会把正常的多波次计划整条标失败。

    实测踩过：菱形计划（调研 → 写作/配图 → 汇编）在第一波就把写作/配图/汇编
    全标成「依赖成环，无法执行」，因为它们当时既不 ready（上游还没跑）也不 blocked。
    """

    def test_downstream_of_pending_task_is_not_deadlocked(self):
        tasks = [
            _task("task_0", order=0),
            _task("task_1", deps=["task_0"], order=1),
            _task("task_2", deps=["task_1"], order=2),
        ]
        decision = plan_wave_decision(tasks)
        assert decision.ready == ["task_0"]
        assert decision.deadlocked == [], "链式计划里的等待不是死锁"
        assert decision.finished is False

    def test_diamond_only_first_layer_is_ready(self):
        tasks = [
            _task("task_0", order=0),
            _task("task_1", deps=["task_0"], order=1),
            _task("task_2", deps=["task_0"], order=2),
            _task("task_4", deps=["task_1", "task_2"], order=3),
        ]
        decision = plan_wave_decision(tasks)
        assert decision.ready == ["task_0"]
        assert decision.deadlocked == []
        assert decision.blocked == []


class TestClassificationIsTotal:
    """pending 任务的分类必须是**互斥且完备**的：

    ready ∪ blocked ∪ deadlocked ∪ waiting（等上游）= 全部 pending。
    前两类 + 第三类是终态（调用方可标失败），waiting 不是——第 4 类由此测试守边界。
    """

    def test_every_pending_task_is_classified(self):
        tasks = [
            _task("done", status="completed", order=0),
            _task("failed", status="failed", order=1),
            _task("ready_now", deps=["done"], order=2),
            _task("blocked_by_fail", deps=["failed"], order=3),
            _task("blocked_transitive", deps=["blocked_by_fail"], order=4),
            _task("waiting_on_ready", deps=["ready_now"], order=5),
            _task("cycle_a", deps=["cycle_b"], order=6),
            _task("cycle_b", deps=["cycle_a"], order=7),
            _task("dangling", deps=["gone"], order=8),
        ]
        decision = plan_wave_decision(tasks)
        terminal = set(decision.ready) | set(decision.blocked) | set(decision.deadlocked)
        pending = {t["task_id"] for t in tasks if t.get("status") == "pending"}
        # 唯一允许的「未分类」项是等上游的那个（它既非就绪也非终态）
        assert pending - terminal == {"waiting_on_ready"}
        assert len(decision.ready) + len(decision.blocked) + len(decision.deadlocked) == len(
            terminal
        ), "三类互不相交"
        assert set(decision.ready) == {"ready_now", "dangling"}


class TestSelectWave:
    def test_concurrency_one_degrades_to_single_task(self):
        """默认配置（1）= 串行：即使扇出层有 3 个就绪任务，也只取 1 个。

        这是「并行能力在位、但不改变现有业务」的执行层保证。
        """
        tasks = [
            _task("task_1", status="completed", order=0),
            _task("task_2a", deps=["task_1"], order=1),
            _task("task_2b", deps=["task_1"], order=2),
        ]
        assert select_wave(tasks, max_concurrency=1) == ["task_2a"]

    def test_zero_or_negative_treated_as_serial(self):
        tasks = [_task("task_1"), _task("task_2", order=1)]
        assert select_wave(tasks, max_concurrency=0) == ["task_1"]

    def test_caps_to_concurrency_limit(self):
        tasks = [_task(f"task_{i}", order=i) for i in range(5)]
        assert select_wave(tasks, max_concurrency=2) == ["task_0", "task_1"]

    def test_returns_all_when_limit_exceeds_ready(self):
        tasks = [_task("task_1"), _task("task_2", order=1)]
        assert select_wave(tasks, max_concurrency=8) == ["task_1", "task_2"]

    def test_empty_when_nothing_ready(self):
        tasks = [_task("task_1", status="running")]
        assert select_wave(tasks, max_concurrency=4) == []


class TestFinished:
    def test_all_terminal_is_finished(self):
        tasks = [_task("task_1", status="completed"), _task("task_2", status="failed")]
        assert is_plan_finished(tasks) is True

    def test_pending_with_ready_work_is_not_finished(self):
        tasks = [_task("task_1")]
        assert is_plan_finished(tasks) is False

    def test_all_pending_blocked_is_finished(self):
        """没有就绪任务且存在被阻塞任务 → 视为结束，避免执行器空转到超时。"""
        tasks = [
            _task("task_1", status="failed"),
            _task("task_2", deps=["task_1"]),
        ]
        assert is_plan_finished(tasks) is True

    def test_empty_plan_is_finished(self):
        assert is_plan_finished([]) is True
