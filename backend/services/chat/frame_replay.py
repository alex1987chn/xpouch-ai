"""持久帧的**读端**：为续传补放「内存窗口以外」的那一段（批次 D · 第 3 片）。

分工（与 `services.chat.frame_recorder` 对着看）：
- `frame_recorder` 写：把每条 SSE 帧编号并批量落库。
- 本模块读：客户端落后于内存缓冲窗口时，从库里把它缺的那段按 seq 取回来。
- `services.chat.stream_hub` 仍是**实时跟随**通道（进程内、逐条、无延迟）。

为什么需要补放：内存缓冲每 run 只留最近 MAX_EVENTS_PER_RUN 条，客户端断线久了
会落在窗口之前。这时若直接把窗口内的帧当作续传起点，服务端**不会报错**，只是
把中间一段悄悄跳过——用户看到的是文字少了半截。库里那一份正好覆盖这段。

边界（明确不做的事）：库里只有**已落库**的帧，且本模块不判断 run 是否还活着。
「进程重启后 run 已死、只能重放不能跟随」这种情形由调用方（resume 端点）返回
410 交给前端的轮询刷新路径处理——返一个能拿到但立刻结束的空流，会被前端当成
「回答被截断」报错，比 410 更糟。
"""

from __future__ import annotations

from sqlmodel import Session

from crud.run_stream_frame import list_frames_after
from utils.logger import logger


def load_gap_frames(
    db: Session, run_id: str, last_event_id: int, next_live_seq: int | None
) -> list[str]:
    """取回 `(last_event_id, next_live_seq)` 之间缺失的帧（线格式文本，按 seq 升序）。

    Args:
        db: 只读会话（调用方负责生命周期）。
        run_id: 目标 run。
        last_event_id: 客户端已收到的最大 seq。
        next_live_seq: 内存缓冲窗口里最早一条的 seq；None = 客户端没落后，
            不需要补放。

    只在确有缺口时查库（无缺口时零查询）。库里也补不齐时（帧被终态清理过 /
    写失败丢过批）记 warning——此时**确实会少一段**，宁可在日志里看得见。
    """
    if next_live_seq is None or next_live_seq <= last_event_id + 1:
        return []
    missing = next_live_seq - last_event_id - 1
    rows = list_frames_after(db, run_id, last_event_id, limit=missing)
    wires = [row.wire for row in rows]
    if len(wires) < missing:
        logger.warning(
            "[Resume] run=%s 缺 %d 条帧，库里只补到 %d 条（该段已被清理或当时写失败）",
            run_id,
            missing,
            len(wires),
        )
    return wires
