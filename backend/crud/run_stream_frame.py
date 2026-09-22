"""run_stream_frame 的读写（批次 D / 决定 1）。

写端在流式热路径上，故全部为**批量/单条追加**，不做读改写；
读端只服务「按 seq 续读」，不做复杂查询。
清理按 run 终态或按时间 TTL（后者兜住「异常结束没走到终态清理」的残留）。
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, delete, select

from models import RunStreamFrame
from utils.logger import logger
from utils.time import utc_now


def append_frames(db: Session, run_id: str, frames: list[tuple[int, str]]) -> int:
    """批量追加帧：frames = [(seq, wire), ...]。

    调用方（`services.chat.frame_recorder`）负责给出正确的 seq：它是 run 级的
    **持久游标**（跨进程也要单调递增），一行一事件。返回写入条数。
    唯一索引 (run_id, seq) 保证重复发布不会产生重复行——重复时整批回滚并记警告，
    因为「seq 冲突」意味着发布端有问题，静默去重会掩盖它。
    """
    if not frames:
        return 0
    try:
        for seq, wire in frames:
            db.add(RunStreamFrame(run_id=run_id, seq=seq, wire=wire))
        db.commit()
        return len(frames)
    except Exception as exc:  # noqa: BLE001 — 帧持久化失败不能影响实时推送
        db.rollback()
        logger.warning(
            "[RunStreamFrame] 该批帧未落库（实时推送不受影响）: %s",
            exc,
            exc_info=True,
        )
        return 0


def list_frames_after(
    db: Session, run_id: str, after_seq: int, limit: int = 2000
) -> list[RunStreamFrame]:
    """按 seq 升序取 after_seq 之后的帧（续传重放用）。"""
    rows = db.exec(
        select(RunStreamFrame)
        .where(RunStreamFrame.run_id == run_id, RunStreamFrame.seq > after_seq)
        .order_by(RunStreamFrame.seq.asc())
        .limit(limit)
    ).all()
    return list(rows)


def latest_seq(db: Session, run_id: str) -> int | None:
    """该 run 已落库的最大 seq（无则 None）——供续传时判断「库比内存新/旧」。"""
    row = db.exec(
        select(RunStreamFrame.seq)
        .where(RunStreamFrame.run_id == run_id)
        .order_by(RunStreamFrame.seq.desc())
        .limit(1)
    ).first()
    return int(row) if row is not None else None


def prune_run_frames(db: Session, run_id: str) -> int:
    """删除某 run 的全部帧（终态清理，与 checkpoint 清理同一时机调用）。"""
    result = db.exec(delete(RunStreamFrame).where(RunStreamFrame.run_id == run_id))
    db.commit()
    return int(result.rowcount or 0)


def prune_frames_older_than(db: Session, retention_hours: int = 24) -> int:
    """TTL 清扫：兜住「异常结束没走到终态清理」的残留帧。

    与 session_cleanup_service 的既有节奏配合（它已经在做线程/checkpoint 清扫）。
    """
    cutoff: datetime = utc_now() - timedelta(hours=retention_hours)
    result = db.exec(delete(RunStreamFrame).where(RunStreamFrame.created_at < cutoff))
    db.commit()
    return int(result.rowcount or 0)
