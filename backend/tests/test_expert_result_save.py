"""专家结果保存回归：真实 async 会话下的关系懒加载地雷。

task_manager.save_expert_execution_result 曾通过 `subtask.execution_plan`
关系懒加载取计划——懒加载在 async 会话里必炸 MissingGreenlet，队列保存
路径自全异步迁移起静默全灭（产物全靠恢复回放兜底，回放缺席的运行产物
直接丢失，2026-09-27 日志逮到）。假会话测试测不出懒加载——本测试必须
用真实 aiosqlite 会话。
"""

import sys
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.services.task_manager import save_expert_execution_result  # noqa: E402
from models import Artifact, ExecutionPlan, SubTask  # noqa: E402


@pytest.mark.asyncio
async def test_save_expert_execution_result_without_lazy_relationship(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/save-test.db")
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: SQLModel.metadata.create_all(c))

    from sqlmodel.ext.asyncio.session import AsyncSession

    async with AsyncSession(engine) as session:
        session.add(
            ExecutionPlan(
                id="plan-1",
                thread_id="t1",
                run_id=None,  # 不触发 run_event 发射，聚焦产物落库链
                user_query="测试",
            )
        )
        session.add(
            SubTask(
                id="st-1",
                execution_plan_id="plan-1",
                expert_type="coder",
                description="写代码",
                sort_order=0,
            )
        )
        await session.commit()

        ok = await save_expert_execution_result(
            session,
            "st-1",
            "coder",
            "输出内容",
            artifact_data={"type": "text", "title": "结果", "content": "输出内容"},
            duration_ms=5,
        )

    assert ok is True

    async with AsyncSession(engine) as checker:
        art = (await checker.exec(select(Artifact).where(Artifact.sub_task_id == "st-1"))).all()
        assert len(art) == 1
        # thread_id 冗余列由 subtask→plan 链派生
        assert art[0].thread_id == "t1"
    await engine.dispose()
