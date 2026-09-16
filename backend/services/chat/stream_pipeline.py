"""流式图执行的共享管道（首跑流与恢复流共用的四个部件）。

StreamService 的两条流（`handle_langgraph_stream` / `execute_langgraph_stream`）
此前各持一份**逐行同构的管道层**（事件出口 / producer 外壳 / 消费循环 / 断连
分支），任何 bug 都要修两遍。本模块把它收编为一份；各自的**领域正文**（图的
驱动方式、每 token 的业务处理、流结束后的收尾）由调用方注入。

部件职责：
- 事件出口：内容事件 = seq → hub 实时广播 → 持久帧缓冲 → 消费队列（断连期间
  错过的内容可被 resume 端点重放）；传输级标记（[DONE]）只入队列不进重放缓冲。
- producer 外壳：领域正文跑在分离任务里，finally 三连收尾（同步刷帧 → 关实时
  窗口 → done 哨兵）；异常**原样上抛**，不得粉饰成成功。
- 消费循环：取队列下发；长静默期调 on_timeout（心跳保活 + 顺带取消检查）。
- 断连语义：消费者收到 CancelledError 只结束自己，producer 转后台跑完。

行为不变量（tests/test_planning_disconnect_keeps_producer.py 与
tests/test_wave_cancel_consistency.py 锁定，重构不得改变）：
1. 断连不杀 producer；
2. producer 内异常沿 `await producer_task` 传播到消费方；
3. 取消感知两条路：领域正文的 token 检查点 + 消费循环的超时检查；
4. finish_blocking 必须同步调用（producer 的 finally 可能处在取消态，
   任何 await 都可能被跳过，见 frame_recorder 的说明）。

frames/hub 由调用方注入（而非本模块自行 import）：调用方所在的
stream_service 模块符号可被测试替换（M4 两条回归测试桩的就是那里的
get_frame_recorder），自行 import 会让桩失效、测试悄悄连到真实引擎。
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable

from services.chat.frame_recorder import RunFrameRecorder
from services.chat.stream_hub import RunStreamHub
from utils.logger import logger


class StreamPipeline:
    """一条流式图执行的管道实例（一次 run 一例）。"""

    def __init__(
        self,
        *,
        run_id: str | None,
        stream_timeout: float,
        frames: RunFrameRecorder,
        hub: RunStreamHub,
        queue: asyncio.Queue | None = None,
    ):
        self.run_id = run_id
        self._stream_timeout = stream_timeout
        self._frames = frames
        self._hub = hub
        # 首跑流自建队列；恢复流的队列由 recovery 层创建并传入（同一队列
        # 被 execute_langgraph_stream 的消费侧使用，签名保持不变）
        self._queue: asyncio.Queue = queue if queue is not None else asyncio.Queue()
        self._producer_task: asyncio.Task | None = None

    async def emit(self, event_str: str) -> None:
        """内容事件唯一出口：seq → 实时广播 → 持久帧缓冲 → 消费队列。

        run_id 为 None（无持久化的裸流，见 producer 上抛测试）时直接透传。
        """
        if self.run_id:
            seq = await self._frames.reserve_seq(self.run_id)
            event_str = self._hub.publish(self.run_id, event_str, seq)
            self._frames.record(self.run_id, seq, event_str)
        await self._queue.put({"type": "sse", "event": event_str})

    async def emit_transport(self, event_str: str) -> None:
        """传输级标记（[DONE]）：只投给当前消费者，不进重放缓冲。"""
        await self._queue.put({"type": "sse", "event": event_str})

    def start(self, body: Callable[[], Awaitable[None]]) -> asyncio.Task:
        """起 producer 分离任务。必须在调用方的同步上下文里调用：
        create_task 复制当前日志上下文（run= 字段），放进消费生成器里
        再起会丢上下文。
        """
        self._producer_task = asyncio.get_running_loop().create_task(self._spawn_producer(body))
        return self._producer_task

    def events(
        self,
        *,
        on_timeout: Callable[[], str],
        on_drained: Callable[[], Awaitable[None]] | None = None,
    ) -> AsyncGenerator[str]:
        """消费生成器：取队列 → 下发；静默超时发心跳；done 后等 producer。

        on_timeout：静默超时回调（返回心跳线文本）——调用方在里面做心跳
        保活 + 顺带的取消检查。
        on_drained：队列排空且 producer 正常结束后的钩子（恢复流的
        finalize_run_completed；首跑流的收尾在领域正文内部，不在此挂）。
        """
        return self._events(on_timeout, on_drained)

    async def _events(
        self,
        on_timeout: Callable[[], str],
        on_drained: Callable[[], Awaitable[None]] | None,
    ) -> AsyncGenerator[str]:
        producer_task = self._producer_task
        assert producer_task is not None, "先 start(body) 再取 events()"
        try:
            while True:
                try:
                    item = await asyncio.wait_for(self._queue.get(), timeout=self._stream_timeout)
                except TimeoutError:
                    # 专家任务期间可能长时间没有事件：心跳保活（回调里顺带检查取消）
                    yield on_timeout()
                    continue
                if item.get("type") == "done":
                    break
                if item.get("event"):
                    yield item["event"]
            # producer 异常在此传播（不得捕获——此前捕获会把彻底失败的恢复
            # 粉饰成成功，见 tests/test_producer_failure_propagates.py）
            await producer_task
            if on_drained is not None:
                await on_drained()
        except asyncio.CancelledError:
            # 客户端断开连接 ≠ 停止任务：producer 继续在后台跑完（暂停检测、
            # 落库、账本与状态更新都在它里面）。断连期间的事件已进 hub 与
            # 持久帧，重连时由 /chat/{thread_id}/stream/resume 补放。
            # 主动取回异常结果，避免孤儿任务的 "exception was never retrieved" 噪音
            producer_task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
            logger.info("[StreamPipeline] 客户端断开，任务转后台继续: run=%s", self.run_id)
            raise

    async def _spawn_producer(self, body: Callable[[], Awaitable[None]]) -> None:
        try:
            await body()
        finally:
            # 三连收尾保证「异常/取消/正常结束」三条路径都会执行。
            # finish_blocking 是同步写：取消态下任何 await 都可能被跳过，
            # 那会连 done 哨兵都发不出去，消费者就悬挂了（见 frame_recorder）
            if self.run_id:
                self._frames.finish_blocking(self.run_id)
                self._hub.close(self.run_id)
            await self._queue.put({"type": "done"})
