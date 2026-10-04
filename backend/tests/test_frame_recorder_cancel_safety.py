"""RunFrameRecorder 取消安全与失败重试的单元契约（2026-10-05 CI 回归的根因钉）。

CI 实挂形状：取消恰好砸中 producer finally 里 finish_blocking 的写入 await——
批次已离队、写未发生、无重试路径，run_stream_frame 永远为空（wave-cancel
测试的「执行期事件应连续落帧，实际 []」）。历史上这里设计为同步写正是为了
取消态安全，全异步化时被误改成裸 await。本文件直接构造取消场景钉住：

1. finish_blocking 在等待写入时被取消：帧仍必须落库（shield + 等内层落定）；
2. flush 写失败后的重试：批次退回缓冲必须主动武装重试定时器（安静期无新帧
   也要在退避后自行重试，不能只等收尾兜底）。
"""

import asyncio

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from crud.run_stream_frame import list_frames_after
from models import RunStreamFrame
from services.chat.frame_recorder import RunFrameRecorder

_TEST_ENGINE_HOLDER = [None]


def _test_session_cm():
    from sqlmodel.ext.asyncio.session import AsyncSession

    return AsyncSession(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


@pytest.fixture
async def engine():
    _TEST_ENGINE_HOLDER[0] = e = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with e.begin() as conn:
        await conn.run_sync(
            lambda c: SQLModel.metadata.create_all(c, tables=[RunStreamFrame.__table__])
        )
    yield e
    await e.dispose()


async def _seed_one_frame(recorder: RunFrameRecorder, run_id: str = "r-cancel") -> None:
    seq = await recorder.reserve_seq(run_id)
    await recorder.record(run_id, seq, f'{{"id": {seq}, "type": "x"}}')


async def test_finish_blocking_survives_cancellation(engine):
    """取消砸中收尾写：批次已离队，帧仍必须落库。"""
    recorder = RunFrameRecorder(session_factory=_test_session_cm, flush_interval=999)
    await _seed_one_frame(recorder)

    # 内层写注入延迟，保证取消稳定砸中「批次已离队、写在途」的窗口
    real_write = recorder._write_batch

    async def _slow_write(run_id, batch):
        await asyncio.sleep(0.05)
        return await real_write(run_id, batch)

    import unittest.mock as _mock

    with _mock.patch.object(recorder, "_write_batch", _slow_write):
        writer = asyncio.create_task(recorder.finish_blocking("r-cancel"))
        await asyncio.sleep(0.01)  # 走到内部写入 await
        writer.cancel()
        with pytest.raises(asyncio.CancelledError):
            await writer

    async with _test_session_cm() as db:
        frames = await list_frames_after(db, "r-cancel", 0)
    assert [f.seq for f in frames] == [1], "收尾被取消后帧仍必须落库（shield 语义）"


async def test_flush_failure_retries_without_new_traffic(engine, monkeypatch):
    """写失败 + 安静期（无新帧）：退避后必须自行重试，而非滞留到收尾。"""
    recorder = RunFrameRecorder(session_factory=_test_session_cm, flush_interval=0.05)
    await _seed_one_frame(recorder, "r-retry")

    calls = 0
    real_write = recorder._write_batch

    async def _flaky_write(run_id, batch):
        nonlocal calls
        calls += 1
        if calls == 1:
            return False  # 首写失败（模拟 DB 抖动；返回 False = 未整批落库）
        return await real_write(run_id, batch)

    monkeypatch.setattr(recorder, "_write_batch", _flaky_write)

    # 手动触发一次 flush（等价于定时器到期）：失败后应已武装重试定时器，
    # 退避（2s）+ 间隔后自行重试成功——不再需要任何新帧到达
    await recorder.flush("r-retry")
    async with _test_session_cm() as db:
        assert await list_frames_after(db, "r-retry", 0) == []  # 首写失败，未落库

    ok = await asyncio.wait_for(_poll_frames("r-retry"), timeout=6)
    assert ok, "退避后应主动重试落库（_arm_retry 语义），安静期也不能滞留"


async def _poll_frames(run_id: str) -> bool:
    deadline = asyncio.get_running_loop().time() + 5
    while asyncio.get_running_loop().time() < deadline:
        async with _test_session_cm() as db:
            if await list_frames_after(db, run_id, 0):
                return True
        await asyncio.sleep(0.05)
    return False
