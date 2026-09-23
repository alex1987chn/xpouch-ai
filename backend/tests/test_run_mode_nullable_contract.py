"""run.mode 可空契约回归（迁移 20260923_000100 的接口侧锚点）

背景：mode 此前在 run 出生时写占位值 "router"（路由决策后更新 simple/complex），
决策前终止的 run 永远停在该值；统计/详情接口的 Literal["simple","complex"]
契约一条坏行即拒收整个响应——运行统计页全量加载失败（2026-09-23 本地实测
15 条 router 行炸列表）。

修法是"没决策如实存 NULL"。本测试锚定接口侧不回归：
1. mode=None（决策前终止的新形态）可序列化；
2. mode="router"（未跑迁移的存量库）不再被拒——接口对存量宽容，数据由迁移清洗。
"""

from datetime import datetime

from models.enums import RunStatus
from schemas.run_event import RunSummaryResponse
from schemas.stats import RunListItem


def _run(mode):
    """最小可校验的 AgentRun 形状（from_attributes 取的就是这些键）。"""
    return {
        "id": "r1",
        "thread_id": "t1",
        "user_id": "u1",
        "entrypoint": "chat",
        "mode": mode,
        "status": RunStatus.CANCELLED,
        "current_node": None,
        "error_code": None,
        "error_message": None,
        "created_at": datetime(2026, 9, 23, 8, 0, 0),
        "started_at": datetime(2026, 9, 23, 8, 0, 0),
        "updated_at": datetime(2026, 9, 23, 8, 0, 5),
        "last_heartbeat_at": None,
        "completed_at": datetime(2026, 9, 23, 8, 0, 5),
        "cancelled_at": datetime(2026, 9, 23, 8, 0, 5),
        "timed_out_at": None,
        "deadline_at": None,
    }


def test_run_summary_accepts_none_mode():
    """决策前终止的 run（mode=NULL）在详情/统计响应中不再炸。"""
    resp = RunSummaryResponse.model_validate(_run(None))
    assert resp.mode is None


def test_run_summary_tolerates_legacy_router_value():
    """未跑迁移的库仍有 mode='router' 存量——接口不拒收（数据由迁移清洗）。"""
    resp = RunSummaryResponse.model_validate(_run("router"))
    assert resp.mode == "router"


def test_run_list_item_accepts_none_mode():
    item = RunListItem(
        run_id="r1",
        thread_id="t1",
        user_id=None,
        user_name=None,
        mode=None,
        status=RunStatus.CANCELLED,
        duration_ms=None,
        created_at=datetime(2026, 9, 23, 8, 0, 0),
        completed_at=None,
    )
    assert item.mode is None
