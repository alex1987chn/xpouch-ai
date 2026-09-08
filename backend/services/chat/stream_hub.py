"""
RunStreamHub - 断线续传（B6 resumable stream MVP）

每个 run 一个有界事件缓冲 + 订阅者广播：
- publish(run_id, wire): 分配递增 seq，注入到 SSE 线格式的 id: 行，
  存入环形缓冲并广播给所有订阅者（含主连接之外的 resume 连接）
- subscribe(run_id, after_seq): 返回 (backlog, subscriber queue)——
  断线重连的连接先补放 backlog，再从队列接收后续事件
- close(run_id): producer 收尾时调用，向订阅者投递哨兵并标记关闭

内存语义（MVP 边界）：
- 缓冲在进程内，服务重启即丢——resume 端点返回 410，前端退化到
  现有"后台跑完 + 轮询刷新"路径
- run 总量 LRU 上限 + 单 run 事件条数上限，防无界增长
"""

import asyncio
import threading
from collections import OrderedDict

# 单 run 缓冲的事件条数上限（超出即丢弃最旧，重连时若 last_seq 早于最旧则 410）
MAX_EVENTS_PER_RUN = 2000
# 同时保留缓冲的 run 数上限（LRU）
MAX_TRACKED_RUNS = 100


class _RunBuffer:
    """单个 run 的事件缓冲与订阅者"""

    def __init__(self) -> None:
        self.seq = 0
        self.events: OrderedDict[int, str] = OrderedDict()
        self.subscribers: list[asyncio.Queue] = []
        self.closed = False

    def append(self, wire: str) -> tuple[int, str]:
        self.seq += 1
        id_wire = self._with_id(wire, self.seq)
        self.events[self.seq] = id_wire
        while len(self.events) > MAX_EVENTS_PER_RUN:
            self.events.popitem(last=False)
        return self.seq, id_wire

    @staticmethod
    def _with_id(wire: str, seq: int) -> str:
        """把 seq 注入线格式的 id: 行（已有 id 则替换，无则前置）"""
        id_line = f"id: {seq}"
        if wire.startswith("id: "):
            _, _, rest = wire.partition("\n")
            return f"{id_line}\n{rest}" if rest else f"{id_line}\n\n"
        return f"{id_line}\n{wire}"

    def backlog(self, after_seq: int) -> list[tuple[int, str]]:
        return [(seq, wire) for seq, wire in self.events.items() if seq > after_seq]


class RunStreamHub:
    """run 级事件广播与重放"""

    def __init__(self, max_runs: int = MAX_TRACKED_RUNS):
        self._runs: OrderedDict[str, _RunBuffer] = OrderedDict()
        self._lock = threading.Lock()
        self._max_runs = max_runs

    def publish(self, run_id: str, wire: str) -> str:
        """记录并广播一条事件；返回带 id 的线格式。"""
        with self._lock:
            buf = self._runs.get(run_id)
            if buf is None:
                buf = _RunBuffer()
                self._runs[run_id] = buf
                while len(self._runs) > self._max_runs:
                    self._runs.popitem(last=False)
            self._runs.move_to_end(run_id)
            seq, id_wire = buf.append(wire)
            subscribers = list(buf.subscribers)
        for queue in subscribers:
            queue.put_nowait((seq, id_wire))
        return id_wire

    def close(self, run_id: str) -> None:
        """producer 收尾：向订阅者投递哨兵（None），缓冲保留供迟到的 resume"""
        with self._lock:
            buf = self._runs.get(run_id)
            subscribers = list(buf.subscribers) if buf else []
            if buf:
                buf.closed = True
                buf.subscribers.clear()
        for queue in subscribers:
            queue.put_nowait(None)

    def subscribe(
        self, run_id: str, after_seq: int
    ) -> tuple[list[tuple[int, str]], asyncio.Queue, bool] | None:
        """订阅 run 的后续事件。

        返回 (backlog, queue, closed)；backlog 为 (seq, wire) 列表，
        queue 里是后续 (seq, wire)，None 哨兵表示流结束。
        run 不在缓冲（重启/被淘汰）返回 None。
        """
        with self._lock:
            buf = self._runs.get(run_id)
            if buf is None:
                return None
            self._runs.move_to_end(run_id)
            if buf.closed:
                return [], asyncio.Queue(), True
            queue: asyncio.Queue = asyncio.Queue()
            buf.subscribers.append(queue)
            return buf.backlog(after_seq), queue, False

    def unsubscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        with self._lock:
            buf = self._runs.get(run_id)
            if buf and queue in buf.subscribers:
                buf.subscribers.remove(queue)


_stream_hub = RunStreamHub()


def get_stream_hub() -> RunStreamHub:
    return _stream_hub
