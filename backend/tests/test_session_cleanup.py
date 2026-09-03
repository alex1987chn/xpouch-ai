"""SessionCleanup 线程清除逻辑测试（此前该任务零测试覆盖，线上外键违例长期静默）。"""

from contextlib import contextmanager

from models import AgentRun, ExecutionPlan, Thread
from services.session_cleanup_service import _purge_thread


class _FakeResult:
    def __init__(self, items):
        self._items = list(items)

    def all(self):
        return list(self._items)


class _FakeSession:
    """模拟 SQLModel Session：按查询实体返回 plans/runs，记录 delete 顺序。"""

    def __init__(self, plans=(), runs=(), fail_on_delete_of=None):
        self._plans = list(plans)
        self._runs = list(runs)
        self._fail_on = fail_on_delete_of
        self.deleted: list = []
        self.nested_entered = 0

    @contextmanager
    def begin_nested(self):
        self.nested_entered += 1
        yield

    # SQLModel Session.exec 接口的 mock（模拟查询，非代码执行）
    def _session_exec(self, stmt):
        entity = stmt.column_descriptions[0]["entity"]
        if entity is ExecutionPlan:
            return _FakeResult(self._plans)
        if entity is AgentRun:
            return _FakeResult(self._runs)
        return _FakeResult([])

    exec = _session_exec

    def add(self, obj):
        return None

    def flush(self):
        return None

    def delete(self, obj):
        if self._fail_on is not None and isinstance(obj, self._fail_on):
            raise RuntimeError("模拟外键违例")
        self.deleted.append(obj)


def _make_thread():
    return Thread(id="thread-1", status="idle", execution_plan_id="plan-1")


def test_purge_thread_deletes_children_before_thread():
    plan = ExecutionPlan(id="plan-1", thread_id="thread-1")
    run = AgentRun(id="run-1", thread_id="thread-1")
    thread = _make_thread()
    session = _FakeSession(plans=[plan], runs=[run])

    assert _purge_thread(session, thread) == ["run-1"]
    # 删除顺序：先子（plan/run）后父（thread）
    assert session.deleted == [plan, run, thread]
    # 当前计划指针先解除
    assert thread.execution_plan_id is None
    # 逐线程 savepoint 隔离生效
    assert session.nested_entered == 1


def test_purge_thread_isolates_failure():
    """单个线程删除失败（如外键违例）不外抛，返回 None 由调用方跳过。"""
    plan = ExecutionPlan(id="plan-1", thread_id="thread-1")
    thread = _make_thread()
    session = _FakeSession(plans=[plan], fail_on_delete_of=Thread)

    assert _purge_thread(session, thread) is None
    assert session.deleted == [plan]  # thread 删除失败前子数据按序尝试过
