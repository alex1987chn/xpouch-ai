"""run_stream_frame 的读写测试（批次 D / 决定 1）。

本表是「SSE 续传在进程重启后仍成立」的基础，因此要钉死的性质是
**按 seq 有序、不重不漏、终态可清**。用一次性内存 SQLite，与既有测试同惯例。
"""

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from crud.run_stream_frame import (
    append_frames,
    latest_seq,
    list_frames_after,
    prune_frames_older_than,
    prune_run_frames,
)
from models import AgentRun, RunStreamFrame, Thread

_TEST_ENGINE_HOLDER = [None]


async def _init_tables(engine, tables=None):

    async with engine.begin() as conn:
        await conn.run_sync(
            lambda c: (
                SQLModel.metadata.create_all(c, tables=tables)
                if tables
                else SQLModel.metadata.create_all(c)
            )
        )


def _test_session() -> "AsyncSession":
    from sqlmodel.ext.asyncio.session import AsyncSession as _AS

    return _AS(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


TABLES = [Thread.__table__, AgentRun.__table__, RunStreamFrame.__table__]


@pytest.fixture
async def db():
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    await _init_tables(engine, tables=TABLES)
    async with _test_session() as session:
        session.add(Thread(id="t1", title="会话", user_id="u1"))
        session.add(AgentRun(id="r1", thread_id="t1", user_id="u1"))
        await session.commit()
        yield session


class TestAppendAndRead:
    async def test_appends_and_reads_back_in_order(self, db):
        await append_frames(db, "r1", [(1, "event: a\ndata: 1\n\n"), (2, "event: b\ndata: 2\n\n")])

        rows = await list_frames_after(db, "r1", 0)

        assert [r.seq for r in rows] == [1, 2]
        assert rows[0].wire.startswith("event: a")

    async def test_resume_returns_only_frames_after_seq(self, db):
        await append_frames(db, "r1", [(1, "w1"), (2, "w2"), (3, "w3")])

        rows = await list_frames_after(db, "r1", 1)

        assert [r.seq for r in rows] == [2, 3], "续传只能拿到 last_event_id 之后的帧"

    async def test_frames_are_scoped_per_run(self, db):
        db.add(AgentRun(id="r2", thread_id="t1", user_id="u1"))
        await db.commit()
        await append_frames(db, "r1", [(1, "run1")])
        await append_frames(db, "r2", [(1, "run2")])

        assert [r.wire for r in await list_frames_after(db, "r1", 0)] == ["run1"]

    async def test_latest_seq_reflects_max(self, db):
        assert await latest_seq(db, "r1") is None
        await append_frames(db, "r1", [(5, "w"), (9, "w")])
        assert await latest_seq(db, "r1") == 9

    async def test_empty_append_is_noop(self, db):
        assert await append_frames(db, "r1", []) == 0
        assert await list_frames_after(db, "r1", 0) == []


class TestIdempotencyAndFailure:
    async def test_duplicate_seq_does_not_create_duplicate_rows(self, db):
        """唯一索引 (run_id, seq) 是重放有序性的基础：重复发布不得产生重复行。"""
        await append_frames(db, "r1", [(1, "first")])
        await append_frames(db, "r1", [(1, "again"), (2, "second")])  # 整批因冲突回滚

        rows = await list_frames_after(db, "r1", 0)

        assert [r.seq for r in rows] == [1], "冲突批次应整体回滚（不部分写入）"
        assert rows[0].wire == "first"

    async def test_failure_does_not_raise(self, db):
        """落库失败不得抛出——实时推送不能被帧持久化的故障拖垮。"""

        class _BoomSession:
            def add(self, _obj):
                raise RuntimeError("db down")

            async def commit(self):
                pass

            async def rollback(self):
                pass

        assert await append_frames(_BoomSession(), "r1", [(1, "w")]) == 0


class TestPrune:
    async def test_prune_run_removes_all_its_frames(self, db):
        await append_frames(db, "r1", [(1, "w1"), (2, "w2")])

        removed = await prune_run_frames(db, "r1")

        assert removed == 2
        assert await list_frames_after(db, "r1", 0) == []

    async def test_prune_run_leaves_other_runs_untouched(self, db):
        db.add(AgentRun(id="r2", thread_id="t1", user_id="u1"))
        await db.commit()
        await append_frames(db, "r1", [(1, "w")])
        await append_frames(db, "r2", [(1, "w")])

        await prune_run_frames(db, "r1")

        assert len(await list_frames_after(db, "r2", 0)) == 1

    async def test_ttl_prune_removes_old_frames_only(self, db):
        from datetime import timedelta

        from sqlmodel import select

        from utils.time import utc_now

        await append_frames(db, "r1", [(1, "old")])
        stale = (await db.exec(select(RunStreamFrame).where(RunStreamFrame.seq == 1))).first()
        stale.created_at = utc_now() - timedelta(hours=48)
        db.add(stale)
        await db.commit()
        await append_frames(db, "r1", [(2, "fresh")])

        removed = await prune_frames_older_than(db, retention_hours=24)

        assert removed == 1
        assert [r.seq for r in await list_frames_after(db, "r1", 0)] == [2]
