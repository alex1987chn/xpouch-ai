"""RunStreamFrame —— 运行期 SSE 帧的**瞬态**持久化（批次 D / 决定 1）。

用途：让 SSE 续传在**进程重启后仍然成立**，并为将来多实例部署铺路。

与 `RunEvent` 的分工（不要混淆）：
- `runevent`：**永久审计账本**，记录里程碑语义（谁在第几版批准了计划、
  哪个任务产出了什么）。只追加、不删除、供时间线/审计消费。
- `run_stream_frame`：**瞬态传输缓冲**，记录逐条 SSE 线（含 token 级增量），
  只服务于「断线后按 seq 重放」。run 到达终态即清理，不承担审计职责。

为什么单独一张表而不是复用 runevent：token 级增量帧的数量比里程碑高两个数量级，
写进审计表会把账本撑爆，也让「事件账本」这一语义被传输细节污染。

seq 空间与进程内缓冲（stream_hub）一致，便于「先读库、再跟随实时」的切换；
本表只保证「已落库的帧可按序重放」，不保证实时性（跟随仍走内存缓冲/NOTIFY）。
"""

from datetime import datetime

from sqlalchemy import Column, Index, Text, func
from sqlmodel import Field, SQLModel

from utils.time import utc_now_naive


class RunStreamFrame(SQLModel, table=True):
    """一条已发布的 SSE 帧（run 级、按 seq 有序）。"""

    __tablename__ = "run_stream_frame"

    # 自增整型主键：本表是高频追加-清理型，无需全局唯一业务 id
    id: int | None = Field(default=None, primary_key=True)

    # run 删除则帧删除（帧是 run 的附属传输数据，无独立生命周期）
    run_id: str = Field(foreign_key="agentrun.id", max_length=64, ondelete="CASCADE")

    # 与发布端（stream_hub / services.chat.frame_recorder）同一 seq 空间。
    # **一行 = 一条 SSE 事件**：续传按 `seq > last_event_id` 取帧，而客户端的
    # last_event_id 可能停在半批中间（实时通道是逐条下发的）；若把多条事件并成
    # 一行、只记最后一条的 seq，重放会把整行再发一遍，已收到的事件被重复应用
    # （token 重复 = 正文重影）。写端的批量提交已拿回写放大，多出来的只是行数——
    # 本表瞬态、run 终态即清，量级可接受。
    seq: int = Field(index=False)

    # SSE 线文本（含 `id: <seq>` 行）
    wire: str = Field(sa_column=Column(Text, nullable=False))

    created_at: datetime = Field(
        default_factory=utc_now_naive,
        sa_column_kwargs={"server_default": func.now()},
    )

    # 唯一约束保证同一 run 内 seq 不重复（重放有序性的基础）
    __table_args__ = (
        Index("uq_run_stream_frame_run_seq", "run_id", "seq", unique=True),
        Index("ix_run_stream_frame_created_at", "created_at"),
    )
