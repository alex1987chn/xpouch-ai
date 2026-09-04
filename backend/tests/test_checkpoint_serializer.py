"""checkpoint 序列化器 msgpack 白名单测试。

背景：task_list 携带 TaskStatus 枚举进入图状态/checkpoint。未注册类型会被
langgraph 警告并将在未来版本直接拒绝反序列化（HITL 恢复全挂）。
"""

import warnings

from utils.db import get_checkpointer_serializer


def test_serializer_preserves_task_status_without_warning():
    serializer = get_checkpointer_serializer()

    from models.enums import TaskStatus

    data = {
        "task_list": [{"id": "t1", "status": TaskStatus.RUNNING}],
        "nested": [TaskStatus.PENDING, TaskStatus.COMPLETED],
    }
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        restored = serializer.loads_typed(serializer.dumps_typed(data))

    assert not caught, f"存在未注册类型警告: {[str(w.message) for w in caught]}"
    assert restored["task_list"][0]["status"] is TaskStatus.RUNNING
    assert restored["nested"][0] is TaskStatus.PENDING
    assert restored["nested"][1] is TaskStatus.COMPLETED
