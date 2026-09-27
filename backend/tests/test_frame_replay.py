"""续传缺口补放（批次 D · 第 3 片）与终态帧清理的回归测试。

要钉死的性质：
1. 客户端落后于内存窗口时，**缺的那一段从库里补回来**——这是「静默少半截文字」
   这个 bug 的根治点，缺了它服务端不会报错、只是内容变少。
2. 没缺口时零查询（热路径不该被多余的 DB 往返拖慢）。
3. 库里也补不齐时只告警、不抛（重放尽力而为，不能把续传请求打挂）。
4. run 终态时帧确实被清掉（`cleanup_terminal_run` → `_prune_frames_for_runs`）。
"""

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from crud.run_stream_frame import append_frames, list_frames_after
from models import AgentRun, RunStreamFrame, Thread
from services.chat.frame_replay import load_gap_frames, load_replay_frames
from utils.db import _prune_frames_for_runs

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


def _test_session():
    from sqlmodel.ext.asyncio.session import AsyncSession

    return AsyncSession(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


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


def _wire(seq: int) -> str:
    return f"id: {seq}\nevent: message.delta\ndata: {seq}\n\n"


def _id_of(wire: str) -> int:
    return int(wire.split("\n", 1)[0].removeprefix("id: "))


class TestGapReplay:
    async def test_no_gap_means_no_query(self, db):
        """客户端的位置就在窗口前一条 → 无需补放（也不该查库）。"""
        assert await load_gap_frames(db, "r1", last_event_id=5, next_live_seq=6) == []
        assert await load_gap_frames(db, "r1", last_event_id=5, next_live_seq=5) == []

    async def test_unknown_window_is_noop(self, db):
        assert await load_gap_frames(db, "r1", last_event_id=5, next_live_seq=None) == []

    async def test_fills_exactly_the_gap(self, db):
        """客户端停在 3，内存窗口从 7 开始 → 必须补回 4/5/6，且不多不少。"""
        await append_frames(db, "r1", [(seq, _wire(seq)) for seq in range(1, 11)])

        wires = await load_gap_frames(db, "r1", last_event_id=3, next_live_seq=7)

        assert [_id_of(w) for w in wires] == [4, 5, 6]

    async def test_shortfall_is_not_fatal(self, db):
        """库里只有一部分（其余已被终态清理）→ 补多少算多少，不抛。"""
        await append_frames(db, "r1", [(seq, _wire(seq)) for seq in (4, 5)])  # 缺 6

        wires = await load_gap_frames(db, "r1", last_event_id=3, next_live_seq=7)

        assert [_id_of(w) for w in wires] == [4, 5]

    async def test_does_not_touch_other_runs(self, db):
        db.add(AgentRun(id="r2", thread_id="t1", user_id="u1"))
        await db.commit()
        await append_frames(db, "r2", [(4, _wire(4))])

        assert await load_gap_frames(db, "r1", last_event_id=3, next_live_seq=7) == []


class TestReplayFrames:
    """整段重放：没有实时窗口可跟随时（run 停在审批点、本轮流已收尾）。"""

    async def test_takes_everything_after_last(self, db):
        await append_frames(db, "r1", [(seq, _wire(seq)) for seq in range(1, 6)])

        wires = await load_replay_frames(db, "r1", last_event_id=0)

        assert [_id_of(w) for w in wires] == [1, 2, 3, 4, 5]

    async def test_respects_client_position(self, db):
        """客户端已经收到一部分（last_event_id=4）→ 只补 5，不重复推送。"""
        await append_frames(db, "r1", [(seq, _wire(seq)) for seq in range(1, 6)])

        wires = await load_replay_frames(db, "r1", last_event_id=4)

        assert [_id_of(w) for w in wires] == [5]

    async def test_truncates_at_cap(self, db, monkeypatch):
        """上限兜底：超出即截断（重放尽力而为，不让一个请求拖着上万行）。"""
        monkeypatch.setattr("services.chat.frame_replay.MAX_REPLAY_FRAMES", 3)
        await append_frames(db, "r1", [(seq, _wire(seq)) for seq in range(1, 8)])

        wires = await load_replay_frames(db, "r1", last_event_id=0)

        assert [_id_of(w) for w in wires] == [1, 2, 3]


class TestTerminalPrune:
    async def test_prunes_frames_of_given_runs(self, db, monkeypatch):
        """终态清理必须真的把帧删掉（否则瞬时表会一直涨到 TTL 兜底）。"""
        await append_frames(db, "r1", [(seq, _wire(seq)) for seq in (1, 2, 3)])
        db.add(AgentRun(id="r2", thread_id="t1", user_id="u1"))
        await db.commit()
        await append_frames(db, "r2", [(1, _wire(1))])

        removed = await _prune_frames_for_runs(["r1"], session=db)

        assert removed == 3
        assert await list_frames_after(db, "r1", 0) == []
        assert len(await list_frames_after(db, "r2", 0)) == 1, "不得误伤其它 run"

    async def test_failure_warns_instead_of_raising(self, monkeypatch):
        """清理属于收尾动作：DB 故障只告警，不能把取消/驳回流程打断。"""

        def _boom(*_args, **_kwargs):
            raise RuntimeError("db down")

        monkeypatch.setattr("crud.run_stream_frame.prune_run_frames", _boom)

        assert await _prune_frames_for_runs(["r1"]) == 0
