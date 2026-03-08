from types import SimpleNamespace

from agents.services import task_manager
from schemas.task import SubTaskCreate


class _FakeSession:
    def __init__(self):
        self.deleted = []
        self.added = []
        self.committed = False
        self.refreshed = []

    def delete(self, obj):
        self.deleted.append(obj)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        self.refreshed.append(obj)


def test_get_or_create_execution_plan_passes_run_id_when_creating(monkeypatch):
    captured = {}

    def _fake_get_execution_plan_by_thread(_db, _thread_id):
        return None

    def _fake_create_execution_plan_with_subtasks(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id="plan-1")

    monkeypatch.setattr(
        task_manager, "get_execution_plan_by_thread", _fake_get_execution_plan_by_thread
    )
    monkeypatch.setattr(
        task_manager,
        "create_execution_plan_with_subtasks",
        _fake_create_execution_plan_with_subtasks,
    )

    db = _FakeSession()
    plan, is_reused = task_manager.get_or_create_execution_plan(
        db=db,
        thread_id="thread-1",
        run_id="run-1",
        user_query="查路线",
        plan_summary="顺序执行",
        estimated_steps=1,
        subtasks_data=[
            SubTaskCreate(
                expert_type="search",
                task_description="搜索路线",
                task_id="task-1",
            )
        ],
        execution_mode="sequential",
    )

    assert plan.id == "plan-1"
    assert is_reused is False
    assert captured["run_id"] == "run-1"


def test_get_or_create_execution_plan_updates_existing_plan_run_id(monkeypatch):
    existing_plan = SimpleNamespace(
        id="plan-1",
        plan_summary=None,
        estimated_steps=0,
        execution_mode="parallel",
        run_id=None,
        status="pending",
    )

    monkeypatch.setattr(
        task_manager, "get_execution_plan_by_thread", lambda *_args, **_kwargs: existing_plan
    )
    monkeypatch.setattr(
        task_manager, "get_subtasks_by_execution_plan", lambda *_args, **_kwargs: []
    )

    def _fake_create_subtask(**kwargs):
        kwargs.setdefault("depends_on", None)
        return SimpleNamespace(id="subtask-1", **kwargs)

    monkeypatch.setattr(task_manager, "create_subtask", _fake_create_subtask)

    db = _FakeSession()
    plan, is_reused = task_manager.get_or_create_execution_plan(
        db=db,
        thread_id="thread-1",
        run_id="run-2",
        user_query="查路线",
        plan_summary="顺序执行",
        estimated_steps=1,
        subtasks_data=[
            SubTaskCreate(
                expert_type="search",
                task_description="搜索路线",
                task_id="task-1",
            )
        ],
        execution_mode="sequential",
    )

    assert is_reused is True
    assert plan is existing_plan
    assert existing_plan.run_id == "run-2"
    assert existing_plan.status == "running"
    assert db.committed is True
