"""RunFrameRecorder —— SSE 帧的「编号 + 批量落库」出口（批次 D · 第 2 片）。

它在流式链路上的位置（`StreamService._push_event` 是唯一调用点）：

    seq = await frames.reserve_seq(run_id)            # ① 分配 run 级序号
    id_wire = hub.publish(run_id, wire, seq)          # ② 实时广播（注入 id: 行）
    frames.record(run_id, seq, id_wire)               # ③ 入缓冲，约 200ms 批量落库

两条通道的分工与失效边界：
- 实时通道（`services.chat.stream_hub`）：进程内，快，但进程重启即丢。
- 持久通道（本模块 → `run_stream_frame` 表）：慢一拍（批量提交），
  但重启后仍可按 seq 重放。
**实时推送绝不等待落库**：落库失败只 warning，客户端该收到的帧一条不少。
失败的那批帧会退回缓冲并退避重试（见 `FLUSH_RETRY_BACKOFF_SECONDS`）——
一次 DB 抖动不该在重放里留下空洞；只有积压超过 `MAX_PENDING_FRAMES` 才丢最旧
并告警（内存不能无界）。终态收尾那次写失败无处重试，只告警。

为什么 seq 由本模块分配、而不是由 stream_hub 自增：seq 是 run 级的**持久游标**。
进程重启后（或缓冲被 LRU 淘汰后）新号段必须接着上次的号往下走，否则唯一索引
`(run_id, seq)` 会让整批 INSERT 冲突回滚，续传就此出现空洞。所以本模块首次见到
某个 run 时先查库里的最大 seq 续号，号段由本模块持有；stream_hub 退化为纯广播器。

为什么是「一行一事件 + 批量 INSERT」，而不是「一帧压多条 SSE + seq 记最后一条」：
续传按 `seq > last_event_id` 取帧，而客户端的 last_event_id 可能停在半批中间
（实时通道是逐条下发的）。若一帧含多条事件、只记最后一条 seq，重放会把整帧再发
一遍，已收到的事件被重复应用（token 重复 = 正文重影）。一行一事件让 `seq >` 的
语义精确；批量提交已经拿回了写放大（约 200ms 一次 INSERT，而非每 token 一次），
多出来的只是行数——本表是瞬态表，run 终态即清，量级可接受。

线程模型：`reserve_seq` / `flush` 都是协程，**只在事件循环线程里**被调用；
只有 `append_frames` 经 `asyncio.to_thread` 到线程池执行。因此 `self._runs`
不需要锁——请保持这个前提，不要从线程里直接访问它。
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable

from sqlmodel import Session

from crud.run_stream_frame import append_frames, latest_seq
from utils.logger import logger

# 批量提交间隔：一个 token 级帧只有几十字节，逐条 INSERT 会让每个 token 都走一次
# 事务（约 50 次/秒/run）。200ms 一次既摊平了写放大，又远小于人眼可感知的断线缺口。
FLUSH_INTERVAL_SECONDS = 0.2
# 写失败后的退避：DB 故障期间不要每 200ms 撞一次——每次尝试都要占一个线程等
# 连接超时，高频重试会把线程池（进而把其它请求的 DB 访问）拖垮。
FLUSH_RETRY_BACKOFF_SECONDS = 2.0
# 单 run 待写帧上限（约 100 秒的 token 流）。只有持续写失败才会逼近它；
# 到了就丢最旧的并告警——重放会缺那一段，但内存不能无界增长。
MAX_PENDING_FRAMES = 5000
# 同时保留待写缓冲的 run 数上限（与 stream_hub 的 LRU 上限同量级）
MAX_TRACKED_RUNS = 100

SessionFactory = Callable[[], Session]


def _default_session_factory() -> Session:
    """默认用应用引擎开一个短生命周期 session。

    延迟导入 `database`：本模块在单元测试里被导入时不应该顺带创建引擎。
    """
    from database import engine

    return Session(engine)


class _RunFrames:
    """单个 run 的待写帧与号段（只在事件循环线程里访问）。"""

    __slots__ = ("pending", "last_seq", "flush_task", "retry_at")

    def __init__(self) -> None:
        self.pending: list[tuple[int, str]] = []
        # 已分配到的最大 seq；None = 本进程还没为这个 run 从库里续过号
        self.last_seq: int | None = None
        self.flush_task: asyncio.Task | None = None
        # 写失败后的重试时刻（事件循环时钟）；0 = 立即可写
        self.retry_at: float = 0.0


class RunFrameRecorder:
    """把逐条 SSE 帧编号、缓冲、批量写进 `run_stream_frame`。"""

    def __init__(
        self,
        session_factory: SessionFactory | None = None,
        flush_interval: float = FLUSH_INTERVAL_SECONDS,
        max_runs: int = MAX_TRACKED_RUNS,
    ) -> None:
        self._session_factory: SessionFactory = session_factory or _default_session_factory
        self._flush_interval = flush_interval
        self._runs: dict[str, _RunFrames] = {}
        self._max_runs = max_runs

    # ── 写端（被 _push_event 调用）─────────────────────────────────────────

    async def reserve_seq(self, run_id: str) -> int:
        """分配该 run 的下一个 seq。

        本进程首次为这个 run 分配时先查库续号（一次 SELECT / run），
        之后纯内存自增。
        """
        buf = self._get_or_create(run_id)
        if buf.last_seq is None:
            base = await asyncio.to_thread(self._read_latest_seq, run_id)
            buf.last_seq = base
            if base:
                logger.info(
                    "[RunFrame] run=%s 从库中续号：本次从 seq=%d 开始（进程重启后不重号）",
                    run_id,
                    base + 1,
                )
        buf.last_seq += 1
        return buf.last_seq

    def record(self, run_id: str, seq: int, wire: str) -> None:
        """把一帧收进待写缓冲，并确保有一个定时 flush 在跑。

        必须在事件循环线程里调用（要 create_task）。
        """
        buf = self._get_or_create(run_id)
        buf.pending.append((seq, wire))
        if buf.flush_task is None:
            buf.flush_task = asyncio.get_running_loop().create_task(
                self._flush_later(run_id, self._next_delay(buf))
            )

    async def flush(self, run_id: str) -> int:
        """把该 run 的待写帧落库；返回**成功落库**的条数（定时器与显式调用都走这里）。"""
        batch = self._take_pending(run_id)
        if not batch:
            return 0
        written = await asyncio.to_thread(self._write_batch, run_id, batch)
        if written:
            return len(batch)
        # 写失败：整批放回队首等重试——一次 DB 抖动不该在重放里留下空洞。
        self._requeue_after_failure(run_id, batch)
        return 0

    def finish_blocking(self, run_id: str) -> int:
        """run 终态收尾：刷净尾部、停掉定时器；返回**成功落库**的条数。

        缓冲条目**不删除**：本进程分配过的最大号（`last_seq`）要留着，因为同一
        run 可能还有下一段流（例如第二次审批续跑），而库里可能仍有在途提交——
        重新查库续号在那种时刻会读到旧的最大值而重号（唯一索引会让新号段整批
        回滚）。条目交由 `_evict_idle_runs` 按 LRU 回收。

        用**同步**写而不是 await：收尾处在 producer 的 `finally` 里，任务处于
        取消态时任何 await 都可能被跳过——那不仅会丢掉尾部帧，还会连带
        `hub.close` 与 `done` 哨兵都发不出去，订阅者就此悬挂。
        写失败时已无处重试（定时器停、缓冲清），只告警。
        """
        buf = self._runs.get(run_id)
        if buf is None:
            return 0
        if buf.flush_task is not None:
            buf.flush_task.cancel()
            buf.flush_task = None
        if not buf.pending:
            return 0
        batch = buf.pending
        buf.pending = []
        return len(batch) if self._write_batch(run_id, batch) else 0

    # ── 内部 ──────────────────────────────────────────────────────────────

    def _get_or_create(self, run_id: str) -> _RunFrames:
        buf = self._runs.get(run_id)
        if buf is None:
            buf = _RunFrames()
            self._runs[run_id] = buf
            self._evict_idle_runs()
        return buf

    def _take_pending(self, run_id: str) -> list[tuple[int, str]]:
        """取走待写帧并放开定时器槽位（期间新到的帧会重新起一个定时器）。"""
        buf = self._runs.get(run_id)
        if buf is None:
            return []
        batch = buf.pending
        buf.pending = []
        buf.flush_task = None
        return batch

    def _requeue_after_failure(self, run_id: str, batch: list[tuple[int, str]]) -> None:
        buf = self._runs.get(run_id)
        if buf is None:
            return
        buf.pending[:0] = batch
        overflow = len(buf.pending) - MAX_PENDING_FRAMES
        if overflow > 0:
            del buf.pending[:overflow]
            logger.warning(
                "[RunFrame] run=%s 待写帧积压超过 %d 条，丢弃最旧 %d 条（重放会缺这一段）",
                run_id,
                MAX_PENDING_FRAMES,
                overflow,
            )
        buf.retry_at = asyncio.get_running_loop().time() + FLUSH_RETRY_BACKOFF_SECONDS

    def _next_delay(self, buf: _RunFrames) -> float:
        """下一次 flush 的等待时长：正常就是提交间隔，写失败后退避到重试时刻。"""
        wait = buf.retry_at - asyncio.get_running_loop().time()
        return wait if wait > 0 else self._flush_interval

    async def _flush_later(self, run_id: str, delay: float) -> None:
        await asyncio.sleep(delay)
        await self.flush(run_id)

    def _write_batch(self, run_id: str, batch: list[tuple[int, str]]) -> bool:
        """写一批帧；返回是否**整批**落库成功。任何异常都吞掉（只告警）。"""
        try:
            with self._session_factory() as db:
                written = append_frames(db, run_id, batch)
            return written == len(batch)
        except Exception as exc:  # noqa: BLE001
            # `append_frames` 自己已兜住写失败；这里再兜一层是防「拿不到 session」
            # 这类它管不到的错误——总之落库任何情况下都不能影响实时推送。
            logger.warning(
                "[RunFrame] 落库异常（实时推送不受影响，该段可能要等重试）: %s",
                exc,
                exc_info=True,
            )
            return False

    def _read_latest_seq(self, run_id: str) -> int:
        try:
            with self._session_factory() as db:
                return latest_seq(db, run_id) or 0
        except Exception as exc:  # noqa: BLE001
            # 读不到就按 0 起号：宁可冒「号段重叠 → 整批回滚并告警」的风险，
            # 也不要让首帧的发送被一次 DB 抖动挡住。
            logger.warning("[RunFrame] 续号查询失败，本次从 seq=1 起号: %s", exc)
            return 0

    def _evict_idle_runs(self) -> None:
        """超出上限时淘汰**没有待写帧**的最旧 run。

        有待写帧的绝不淘汰——那会直接丢帧。终态收尾只刷帧、不摘条目（号段要留到
        被淘汰为止，见 `finish_blocking`），所以这里也是号段条目唯一的回收口。
        """
        if len(self._runs) <= self._max_runs:
            return
        for run_id, buf in list(self._runs.items()):
            if len(self._runs) <= self._max_runs:
                return
            if buf.pending:
                continue
            if buf.flush_task is not None:
                buf.flush_task.cancel()
            self._runs.pop(run_id, None)


_recorder = RunFrameRecorder()


def get_frame_recorder() -> RunFrameRecorder:
    return _recorder
