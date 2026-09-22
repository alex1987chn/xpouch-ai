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
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, delete

from crud.run_stream_frame import append_frames, list_frames_after
from models import AgentRun, RunStreamFrame, Thread
from services.chat.frame_recorder import RunFrameRecorder

TABLES = [Thread.__table__, AgentRun.__table__, RunStreamFrame.__table__]


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=TABLES)
    with Session(engine) as session:
        session.add(Thread(id="t1", title="会话", user_id="u1"))
        session.add(AgentRun(id="r1", thread_id="t1", user_id="u1"))
        session.commit()
    yield engine
    engine.dispose()


@pytest.fixture
def recorder(engine):
    """flush_interval 取 5s：让定时器不会在任何测试里抢跑，除非测试自己等。"""
    return RunFrameRecorder(session_factory=lambda: Session(engine), flush_interval=5)


def _frames(engine, run_id: str = "r1") -> list[RunStreamFrame]:
    with Session(engine) as db:
        return list_frames_after(db, run_id, 0)


def _wire(tag: str) -> str:
    return f"id: 0\nevent: message.delta\ndata: {tag}\n\n"


class TestSeqSpace:
    def test_first_seq_is_one_on_empty_table(self, recorder):
        async def _flow():
            assert await recorder.reserve_seq("r1") == 1
            assert await recorder.reserve_seq("r1") == 2

        asyncio.run(_flow())

    def test_resumes_after_persisted_frames(self, engine, recorder):
        """核心不变量：库里已有 seq 1..7 时，新记录器必须从 8 起号。"""
        with Session(engine) as db:
            append_frames(db, "r1", [(i, _wire(str(i))) for i in range(1, 8)])

        async def _flow():
            return await recorder.reserve_seq("r1")

        assert asyncio.run(_flow()) == 8

    def test_two_recorders_never_collide(self, engine):
        """等价于「重启后接着续」：两个记录器前后接力，落库 seq 不重复。"""

        async def _first():
            rec = RunFrameRecorder(session_factory=lambda: Session(engine), flush_interval=5)
            for tag in ("a", "b"):
                seq = await rec.reserve_seq("r1")
                rec.record("r1", seq, _wire(tag))
            rec.finish_blocking("r1")

        async def _second():
            rec = RunFrameRecorder(session_factory=lambda: Session(engine), flush_interval=5)
            seq = await rec.reserve_seq("r1")
            rec.record("r1", seq, _wire("c"))
            rec.finish_blocking("r1")

        asyncio.run(_first())
        asyncio.run(_second())

        rows = _frames(engine)
        assert [r.seq for r in rows] == [1, 2, 3], "重启后必须续号，不得从 1 重来"

    def test_unreadable_history_falls_back_to_one(self):
        """续号查询失败只降级为「从 1 起号」，绝不挡住首帧发送。"""

        def _boom_session():
            raise RuntimeError("db down")

        rec = RunFrameRecorder(session_factory=_boom_session, flush_interval=5)

        async def _flow():
            return await rec.reserve_seq("r1")

        assert asyncio.run(_flow()) == 1


class TestBatchedPersistence:
    def test_record_is_batched_into_one_flush(self, engine, recorder):
        async def _flow():
            for tag in ("a", "b", "c"):
                seq = await recorder.reserve_seq("r1")
                recorder.record("r1", seq, _wire(tag))
            return await recorder.flush("r1")

        assert asyncio.run(_flow()) == 3

        rows = _frames(engine)
        assert [r.seq for r in rows] == [1, 2, 3]
        assert [r.wire.split("data: ")[1][0] for r in rows] == ["a", "b", "c"]

    def test_flush_of_empty_buffer_is_noop(self, engine, recorder):
        async def _flow():
            return await recorder.flush("r1")

        assert asyncio.run(_flow()) == 0
        assert _frames(engine) == []

    def test_timer_flushes_without_explicit_call(self, engine):
        rec = RunFrameRecorder(session_factory=lambda: Session(engine), flush_interval=0.05)

        async def _flow():
            for tag in ("a", "b"):
                seq = await rec.reserve_seq("r1")
                rec.record("r1", seq, _wire(tag))
            await asyncio.sleep(0.25)  # 只等定时器，不显式 flush

        asyncio.run(_flow())
        assert [r.seq for r in _frames(engine)] == [1, 2]

    def test_frames_land_in_seq_order_across_flushes(self, engine, recorder):
        async def _flow():
            for tag in ("a", "b"):
                seq = await recorder.reserve_seq("r1")
                recorder.record("r1", seq, _wire(tag))
            await recorder.flush("r1")
            for tag in ("c", "d"):
                seq = await recorder.reserve_seq("r1")
                recorder.record("r1", seq, _wire(tag))
            await recorder.flush("r1")

        asyncio.run(_flow())
        assert [r.seq for r in _frames(engine)] == [1, 2, 3, 4]


class TestTerminalFlush:
    def test_finish_blocking_writes_tail_before_timer(self, engine, recorder):
        """终态时定时器还没到 → 尾部帧不能丢。"""

        async def _flow():
            for tag in ("a", "b"):
                seq = await recorder.reserve_seq("r1")
                recorder.record("r1", seq, _wire(tag))
            return recorder.finish_blocking("r1")

        assert asyncio.run(_flow()) == 2
        assert [r.seq for r in _frames(engine)] == [1, 2]

    def test_finish_blocking_twice_is_idempotent(self, engine, recorder):
        async def _flow():
            seq = await recorder.reserve_seq("r1")
            recorder.record("r1", seq, _wire("a"))
            first = recorder.finish_blocking("r1")
            second = recorder.finish_blocking("r1")
            return first, second

        first, second = asyncio.run(_flow())
        assert (first, second) == (1, 0)
        assert [r.seq for r in _frames(engine)] == [1]

    def test_record_after_finish_continues_seq(self, engine, recorder):
        """终态后再来帧（异常路径）也不得重号——从库里续号即可。"""

        async def _flow():
            seq = await recorder.reserve_seq("r1")
            recorder.record("r1", seq, _wire("a"))
            recorder.finish_blocking("r1")
            seq2 = await recorder.reserve_seq("r1")
            recorder.record("r1", seq2, _wire("b"))
            recorder.finish_blocking("r1")
            return seq, seq2

        assert asyncio.run(_flow()) == (1, 2)
        assert [r.seq for r in _frames(engine)] == [1, 2]

    def test_seq_kept_in_memory_when_db_lags(self, engine, recorder):
        """库里的行还没落（在途提交）时也不得重号：号段以内存高水位为准。

        场景：同一 run 的第二段流（第二次审批续跑）在上一段的 flush 尚未提交时开始。
        若此时重新查库续号，就会读到旧的最大值而重号——唯一索引会让新号段整批回滚。
        """

        async def _flow():
            seq = await recorder.reserve_seq("r1")
            recorder.record("r1", seq, _wire("a"))
            recorder.finish_blocking("r1")
            with Session(engine) as db:  # 模拟「库里还看不到」尾帧
                db.exec(delete(RunStreamFrame))
                db.commit()
            return await recorder.reserve_seq("r1")

        assert asyncio.run(_flow()) == 2


class TestFailureIsolation:
    """落库是尽力而为：失败只告警、只重试，绝不打断实时推送。"""

    def _broken_recorder(self) -> RunFrameRecorder:
        class _Boom:
            def __enter__(self):
                raise RuntimeError("db down")

            def __exit__(self, *_exc):
                return False

        return RunFrameRecorder(session_factory=lambda: _Boom(), flush_interval=5)

    def test_write_failure_does_not_raise(self):
        rec = self._broken_recorder()

        async def _flow():
            seq = await rec.reserve_seq("r1")
            rec.record("r1", seq, _wire("a"))
            return await rec.flush("r1")  # 不得抛

        assert asyncio.run(_flow()) == 0

    def test_failed_batch_is_kept_for_retry(self):
        """一次 DB 抖动不该在重放里留下空洞：失败批次必须留在缓冲里。"""
        rec = self._broken_recorder()

        async def _flow():
            seq = await rec.reserve_seq("r1")
            rec.record("r1", seq, _wire("a"))
            await rec.flush("r1")
            return rec._runs["r1"].pending

        assert [seq for seq, _w in asyncio.run(_flow())] == [1]

    def test_retry_succeeds_after_failure(self, engine):
        """先失败后恢复：同一批帧最终要落库，且不重号。"""
        state = {"fail": True}

        def _flaky_session():
            if state["fail"]:
                raise RuntimeError("db blip")
            return Session(engine)

        rec = RunFrameRecorder(session_factory=_flaky_session, flush_interval=5)

        async def _flow():
            seq = await rec.reserve_seq("r1")  # 续号查询也失败 → 从 1 起号
            rec.record("r1", seq, _wire("a"))
            first = await rec.flush("r1")
            state["fail"] = False
            second = await rec.flush("r1")
            return first, second, seq

        first, second, seq = asyncio.run(_flow())
        assert (first, second) == (0, 1)
        assert seq == 1
        assert [r.seq for r in _frames(engine)] == [1]

    def test_finish_blocking_swallows_write_failure(self):
        rec = self._broken_recorder()

        async def _flow():
            seq = await rec.reserve_seq("r1")
            rec.record("r1", seq, _wire("a"))
            return rec.finish_blocking("r1")  # 不得抛

        assert asyncio.run(_flow()) == 0


class TestRetentionWindow:
    def test_frames_carry_utc_aware_created_at(self, engine):
        """created_at 必须是 aware UTC（2026-09-22 全链路 aware 约定）。"""
        rec = RunFrameRecorder(session_factory=lambda: Session(engine), flush_interval=5)

        async def _flow():
            seq = await rec.reserve_seq("r1")
            rec.record("r1", seq, _wire("a"))
            rec.finish_blocking("r1")

        asyncio.run(_flow())
        row = _frames(engine)[0]
        assert isinstance(row.created_at, datetime)
        assert row.created_at.tzinfo is not None


class TestBufferEviction:
    def test_idle_runs_are_evicted_but_pending_are_not(self, engine):
        rec = RunFrameRecorder(
            session_factory=lambda: Session(engine), flush_interval=5, max_runs=2
        )

        async def _flow():
            # r1 留着未落库的帧，r2/r3 是空的 → 只能淘汰 r2
            seq = await rec.reserve_seq("r1")
            rec.record("r1", seq, _wire("a"))
            await rec.reserve_seq("r2")
            await rec.reserve_seq("r3")

        asyncio.run(_flow())
        tracked = set(rec._runs)
        assert "r1" in tracked, "有待写帧的 run 不得被淘汰（那会丢帧）"
        assert "r2" not in tracked
        assert rec.finish_blocking("r1") == 1
