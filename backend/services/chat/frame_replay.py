"""持久帧的**读端**：为续传补放「内存窗口以外」的那一段（批次 D · 第 3 片）。

分工（与 `services.chat.frame_recorder` 对着看）：
- `frame_recorder` 写：把每条 SSE 帧编号并批量落库。
- 本模块读：① `load_gap_frames`——客户端落后于内存缓冲窗口时，从库里补回它缺的那段；
  ② `load_replay_frames`——**没有实时窗口可跟随**时，把整段已落库的帧取回来。
- `services.chat.stream_hub` 仍是**实时跟随**通道（进程内、逐条、无延迟）。

为什么需要补放：内存缓冲每 run 只留最近 MAX_EVENTS_PER_RUN 条，客户端断线久了
会落在窗口之前。这时若直接把窗口内的帧当作续传起点，服务端**不会报错**，只是
把中间一段悄悄跳过——用户看到的是文字少了半截。库里那一份正好覆盖这段。

什么时候用「整段重放」（②）：run 正当停在审批点、而这一轮流已经收尾（缓冲关闭
或进程重启过缓冲丢失）。客户端断连期间错过的是 `human.interrupt`——**审批卡本身**。
此时重放整段并以 `[DONE]` 收尾是对的：这一轮流本来就是正常收尾的，客户端据此
干净结算，卡片也就自己回来了。其他情况（run 还在跑却没有实时通道、或已终态）
仍然由调用方返回 410，交给前端的轮询/刷新路径。
"""

from __future__ import annotations

from sqlmodel import Session

from crud.run_stream_frame import list_frames_after
from utils.logger import logger

# 整段重放的上限：真超了说明客户端落后过多，截断并告警
# （重放尽力而为，不能让一个请求拖着上万行不放）
MAX_REPLAY_FRAMES = 2000


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


def load_replay_frames(db: Session, run_id: str, last_event_id: int) -> list[str]:
    """取 `last_event_id` 之后的**全部**已落库帧（没有实时窗口可跟随时的整段重放）。

    调用方（resume 端点）只在「run 停在审批点、本轮流已收尾」时用这条路：客户端
    断连期间错过的是 `human.interrupt`，而**审批卡就是靠这个事件渲染的**——补不回
    来用户就无处可点。超过 MAX_REPLAY_FRAMES 则截断并告警。
    """
    rows = list_frames_after(db, run_id, last_event_id, limit=MAX_REPLAY_FRAMES)
    if len(rows) >= MAX_REPLAY_FRAMES:
        logger.warning(
            "[Resume] run=%s 整段重放达到上限 %d 条（客户端落后过多，已截断）",
            run_id,
            MAX_REPLAY_FRAMES,
        )
    return [row.wire for row in rows]
