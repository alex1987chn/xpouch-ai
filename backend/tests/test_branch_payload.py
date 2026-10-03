"""Send payload 构建测试：依赖摘要与产物引用两个通道的口径。

`build_branch_payload` 是纯函数（只读 state），直接构造 state 断言输出形状，
不起图、不碰 DB。
"""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.nodes.wave_scheduler import build_branch_payload  # noqa: E402


def _state(outcomes: dict) -> dict:
    return {
        "task_outcomes": outcomes,
        "thread_id": "t1",
        "run_id": "r1",
        "execution_plan_id": "p1",
        "user_id": "u1",
        "task_list": [{}, {}],
    }


def test_payload_carries_summary_and_artifact_ref():
    """有产物的上游：摘要截断进 dependency_outputs，引用（id/type/title）进平行通道。"""
    payload = build_branch_payload(
        _state(
            {
                "task_0": {
                    "output": "x" * 5000,
                    "artifact": {"artifact_id": "art-1", "type": "html", "title": "页面"},
                }
            }
        ),
        {"depends_on": ["task_0"]},
    )
    assert payload["dependency_outputs"]["task_0"] == "x" * 2000
    assert payload["dependency_artifacts"]["task_0"] == {
        "id": "art-1",
        "type": "html",
        "title": "页面",
    }


def test_payload_without_artifact_has_no_ref():
    """无产物的上游（artifact 缺失/失败任务）：引用通道不留空壳。"""
    payload = build_branch_payload(
        _state({"task_0": {"output": "纯文本结论", "artifact": None}}),
        {"depends_on": ["task_0"]},
    )
    assert payload["dependency_outputs"]["task_0"] == "纯文本结论"
    assert "task_0" not in payload["dependency_artifacts"]
    assert payload["dependency_artifacts"] == {}


def test_payload_missing_dependency_leaves_both_channels_empty():
    """依赖产物不存在（上游失败被跳过）：两通道都不写键，走 generic 的容错提示词。"""
    payload = build_branch_payload(_state({}), {"depends_on": ["task_0"]})
    assert payload["dependency_outputs"] == {}
    assert payload["dependency_artifacts"] == {}
