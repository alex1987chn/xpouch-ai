"""RunFrameRecorder 测试（批次 D · 第 2 片）。

要钉死的性质：
1. **号段跨进程可续**：新记录器首次见到某个 run 时从库里续号。若不续号，
   重启后的新号段会与已落库的帧碰撞，唯一索引 `(run_id, seq)` 让整批 INSERT
   回滚——续传就此出现空洞，而且是静默的。
2. 批量落库不丢不重、保序。
3. 终态刷净尾部（定时器还没到也必须写）。
4. 落库失败不得影响实时推送（record/flush 不抛）。
"""

import asyncio
from datetime import datetime

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, delete

from crud.run_stream_frame import append_frames, list_frames_after
from models import AgentRun, RunStreamFrame, Thread
from services.chat.frame_recorder import RunFrameRecorder

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
async def engine():
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
    yield engine
    await engine.dispose()


@pytest.fixture
def recorder(engine):
    """flush_interval 取 5s：让定时器不会在任何测试里抢跑，除非测试自己等。"""
    return RunFrameRecorder(session_factory=lambda: _test_session(), flush_interval=5)


async def _frames(engine, run_id: str = "r1") -> list[RunStreamFrame]:
    async with _test_session() as db:
        return await list_frames_after(db, run_id, 0)


def _wire(tag: str) -> str:
    return f"id: 0\nevent: message.delta\ndata: {tag}\n\n"


class TestSeqSpace:
    async def test_first_seq_is_one_on_empty_table(self, recorder):
        async def _flow():
            assert await recorder.reserve_seq("r1") == 1
            assert await recorder.reserve_seq("r1") == 2

        await _flow()

    async def test_resumes_after_persisted_frames(self, engine, recorder):
        """核心不变量：库里已有 seq 1..7 时，新记录器必须从 8 起号。"""
        async with _test_session() as db:
            await append_frames(db, "r1", [(i, _wire(str(i))) for i in range(1, 8)])

        async def _flow():
            return await recorder.reserve_seq("r1")

        assert await _flow() == 8

    async def test_two_recorders_never_collide(self, engine):
        """等价于「重启后接着续」：两个记录器前后接力，落库 seq 不重复。"""

        async def _first():
            rec = RunFrameRecorder(session_factory=lambda: _test_session(), flush_interval=5)
            for tag in ("a", "b"):
                seq = await rec.reserve_seq("r1")
                await rec.record("r1", seq, _wire(tag))
            await rec.finish_blocking("r1")

        async def _second():
            rec = RunFrameRecorder(session_factory=lambda: _test_session(), flush_interval=5)
            seq = await rec.reserve_seq("r1")
            await rec.record("r1", seq, _wire("c"))
            await rec.finish_blocking("r1")

        await _first()
        await _second()

        rows = await _frames(engine)
        assert [r.seq for r in rows] == [1, 2, 3], "重启后必须续号，不得从 1 重来"

    async def test_unreadable_history_falls_back_to_one(self):
        """续号查询失败只降级为「从 1 起号」，绝不挡住首帧发送。"""

        def _boom_session():
            raise RuntimeError("db down")

        rec = RunFrameRecorder(session_factory=_boom_session, flush_interval=5)

        async def _flow():
            return await rec.reserve_seq("r1")

        assert await _flow() == 1


class TestBatchedPersistence:
    async def test_record_is_batched_into_one_flush(self, engine, recorder):
        async def _flow():
            for tag in ("a", "b", "c"):
                seq = await recorder.reserve_seq("r1")
                await recorder.record("r1", seq, _wire(tag))
            return await recorder.flush("r1")

        assert await _flow() == 3

        rows = await _frames(engine)
        assert [r.seq for r in rows] == [1, 2, 3]
        assert [r.wire.split("data: ")[1][0] for r in rows] == ["a", "b", "c"]

    async def test_flush_of_empty_buffer_is_noop(self, engine, recorder):
        async def _flow():
            return await recorder.flush("r1")

        assert await _flow() == 0
        assert await _frames(engine) == []

    async def test_timer_flushes_without_explicit_call(self, engine):
        rec = RunFrameRecorder(session_factory=lambda: _test_session(), flush_interval=0.05)

        async def _flow():
            for tag in ("a", "b"):
                seq = await rec.reserve_seq("r1")
                await rec.record("r1", seq, _wire(tag))
            await asyncio.sleep(0.25)  # 只等定时器，不显式 flush

        await _flow()
        assert [r.seq for r in await _frames(engine)] == [1, 2]

    async def test_frames_land_in_seq_order_across_flushes(self, engine, recorder):
        async def _flow():
            for tag in ("a", "b"):
                seq = await recorder.reserve_seq("r1")
                await recorder.record("r1", seq, _wire(tag))
            await recorder.flush("r1")
            for tag in ("c", "d"):
                seq = await recorder.reserve_seq("r1")
                await recorder.record("r1", seq, _wire(tag))
            await recorder.flush("r1")

        await _flow()
        assert [r.seq for r in await _frames(engine)] == [1, 2, 3, 4]


class TestTerminalFlush:
    async def test_finish_blocking_writes_tail_before_timer(self, engine, recorder):
        """终态时定时器还没到 → 尾部帧不能丢。"""

        async def _flow():
            for tag in ("a", "b"):
                seq = await recorder.reserve_seq("r1")
                await recorder.record("r1", seq, _wire(tag))
            return await recorder.finish_blocking("r1")

        assert await _flow() == 2
        assert [r.seq for r in await _frames(engine)] == [1, 2]

    async def test_finish_blocking_twice_is_idempotent(self, engine, recorder):
        async def _flow():
            seq = await recorder.reserve_seq("r1")
            await recorder.record("r1", seq, _wire("a"))
            first = await recorder.finish_blocking("r1")
            second = await recorder.finish_blocking("r1")
            return first, second

        first, second = await _flow()
        assert (first, second) == (1, 0)
        assert [r.seq for r in await _frames(engine)] == [1]

    async def test_record_after_finish_continues_seq(self, engine, recorder):
        """终态后再来帧（异常路径）也不得重号——从库里续号即可。"""

        async def _flow():
            seq = await recorder.reserve_seq("r1")
            await recorder.record("r1", seq, _wire("a"))
            await recorder.finish_blocking("r1")
            seq2 = await recorder.reserve_seq("r1")
            await recorder.record("r1", seq2, _wire("b"))
            await recorder.finish_blocking("r1")
            return seq, seq2

        assert await _flow() == (1, 2)
        assert [r.seq for r in await _frames(engine)] == [1, 2]

    async def test_seq_kept_in_memory_when_db_lags(self, engine, recorder):
        """库里的行还没落（在途提交）时也不得重号：号段以内存高水位为准。

        场景：同一 run 的第二段流（第二次审批续跑）在上一段的 flush 尚未提交时开始。
        若此时重新查库续号，就会读到旧的最大值而重号——唯一索引会让新号段整批回滚。
        """

        async def _flow():
            seq = await recorder.reserve_seq("r1")
            await recorder.record("r1", seq, _wire("a"))
            await recorder.finish_blocking("r1")
            async with _test_session() as db:  # 模拟「库里还看不到」尾帧
                await db.exec(await delete(RunStreamFrame))
                await db.commit()
            return await recorder.reserve_seq("r1")

        assert await _flow() == 2


class TestFailureIsolation:
    """落库是尽力而为：失败只告警、只重试，绝不打断实时推送。"""

    def _broken_recorder(self) -> RunFrameRecorder:
        class _Boom:
            def __enter__(self):
                raise RuntimeError("db down")

            def __exit__(self, *_exc):
                return False

        return RunFrameRecorder(session_factory=lambda: _Boom(), flush_interval=5)

    async def test_write_failure_does_not_raise(self):
        rec = self._broken_recorder()

        async def _flow():
            seq = await rec.reserve_seq("r1")
            await rec.record("r1", seq, _wire("a"))
            return await rec.flush("r1")  # 不得抛

        assert await _flow() == 0

    async def test_failed_batch_is_kept_for_retry(self):
        """一次 DB 抖动不该在重放里留下空洞：失败批次必须留在缓冲里。"""
        rec = self._broken_recorder()

        async def _flow():
            seq = await rec.reserve_seq("r1")
            await rec.record("r1", seq, _wire("a"))
            await rec.flush("r1")
            return rec._runs["r1"].pending

        assert [seq for seq, _w in await _flow()] == [1]

    async def test_retry_succeeds_after_failure(self, engine):
        """先失败后恢复：同一批帧最终要落库，且不重号。"""
        state = {"fail": True}

        def _flaky_session():
            if state["fail"]:
                raise RuntimeError("db blip")
            return _test_session()

        rec = RunFrameRecorder(session_factory=_flaky_session, flush_interval=5)

        async def _flow():
            seq = await rec.reserve_seq("r1")  # 续号查询也失败 → 从 1 起号
            await rec.record("r1", seq, _wire("a"))
            first = await rec.flush("r1")
            state["fail"] = False
            second = await rec.flush("r1")
            return first, second, seq

        first, second, seq = await _flow()
        assert (first, second) == (0, 1)
        assert seq == 1
        assert [r.seq for r in await _frames(engine)] == [1]

    async def test_finish_blocking_swallows_write_failure(self):
        rec = self._broken_recorder()

        async def _flow():
            seq = await rec.reserve_seq("r1")
            await rec.record("r1", seq, _wire("a"))
            return await rec.finish_blocking("r1")  # 不得抛

        assert await _flow() == 0


class TestRetentionWindow:
    async def test_frames_carry_utc_aware_created_at(self, engine):
        """created_at 必须是 aware UTC（2026-09-22 全链路 aware 约定）。"""
        rec = RunFrameRecorder(session_factory=lambda: _test_session(), flush_interval=5)

        async def _flow():
            seq = await rec.reserve_seq("r1")
            await rec.record("r1", seq, _wire("a"))
            await rec.finish_blocking("r1")

        await _flow()
        row = (await _frames(engine))[0]
        assert isinstance(row.created_at, datetime)
        assert row.created_at.tzinfo is not None


class TestBufferEviction:
    async def test_idle_runs_are_evicted_but_pending_are_not(self, engine):
        rec = RunFrameRecorder(
            session_factory=lambda: _test_session(), flush_interval=5, max_runs=2
        )

        async def _flow():
            # r1 留着未落库的帧，r2/r3 是空的 → 只能淘汰 r2
            seq = await rec.reserve_seq("r1")
            await rec.record("r1", seq, _wire("a"))
            await rec.reserve_seq("r2")
            await rec.reserve_seq("r3")

        await _flow()
        tracked = set(rec._runs)
        assert "r1" in tracked, "有待写帧的 run 不得被淘汰（那会丢帧）"
        assert "r2" not in tracked
        assert await rec.finish_blocking("r1") == 1
