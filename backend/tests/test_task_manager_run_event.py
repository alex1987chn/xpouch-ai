from types import SimpleNamespace

from agents.services import task_manager


class _FakeSession:
    def __init__(self):
        self.added = []
        self.commits = 0
        self.refreshed = []

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshed.append(obj)


def test_save_expert_execution_result_emits_task_and_artifact_events(monkeypatch):
    session = _FakeSession()
    subtask = SimpleNamespace(
        id="subtask-1",
        execution_plan_id="plan-1",
        execution_plan=SimpleNamespace(run_id="run-1", thread_id="thread-1"),
        status="pending",
        output_result=None,
        completed_at=None,
        duration_ms=None,
        updated_at=None,
    )
    created_artifact = SimpleNamespace(
        id="artifact-1",
        type="markdown",
        title="搜索结果",
    )

    monkeypatch.setattr(task_manager, "get_subtask", lambda *_args, **_kwargs: subtask)
    monkeypatch.setattr(
        task_manager,
        "create_artifacts_batch",
        lambda *_args, **_kwargs: [created_artifact],
    )

    emitted_task_completed = {}
    emitted_artifacts = []

    monkeypatch.setattr(
        task_manager,
        "emit_task_completed",
        lambda *_args, **kwargs: emitted_task_completed.update(kwargs),
    )
    monkeypatch.setattr(
        task_manager,
        "emit_artifact_generated",
        lambda *_args, **kwargs: emitted_artifacts.append(kwargs),
    )

    saved = task_manager.save_expert_execution_result(
        session,
        task_id="subtask-1",
        expert_type="search",
        output_result="done",
        artifact_data={
            "artifact_id": "artifact-1",
            "type": "markdown",
            "title": "搜索结果",
            "content": "done",
        },
        duration_ms=123,
    )

    assert saved is True
    assert subtask.status == "completed"
    assert emitted_task_completed["run_id"] == "run-1"
    assert emitted_task_completed["thread_id"] == "thread-1"
    assert emitted_task_completed["task_id"] == "subtask-1"
    assert emitted_task_completed["has_artifact"] is True
    assert emitted_artifacts[0]["artifact_id"] == "artifact-1"
    assert emitted_artifacts[0]["execution_plan_id"] == "plan-1"
