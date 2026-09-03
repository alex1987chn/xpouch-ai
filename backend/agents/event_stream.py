"""节点 → 传输层的统一事件发射器（SSE 事件协议 v2 的唯一出口）。

设计（替代 v1 的"state 携带 SSE 字符串 + on_chain_end 捞取"模式）：
- 节点 ``await emit_event(...)`` 经 LangChain ``adispatch_custom_event`` 发射，
  在消费端 ``astream_events(version="v2")`` 中以 ``on_custom_event``（name="sse_event"）浮现；
- 事件在本模块统一序列化为 SSE 线格式字符串——节点层不接触传输格式；
- 收益：事件不再进入图状态/checkpoint（消除膨胀）；每条事件恰好发送一次
  （v1 中每个 on_chain_end 全量 flush 累积队列，事件被重复推送 N+1 遍）。

兼容性：
- 图执行上下文之外（单元测试直调节点函数）发射为 no-op（get_config 失败时静默返回），
  保证节点函数可独立调用。
- event_queue（v1 通道）已废弃：节点不再写入，消费端不再读取。
"""

from __future__ import annotations

from typing import Any

from langchain_core.callbacks import adispatch_custom_event
from langchain_core.runnables import RunnableConfig
from langchain_core.runnables.config import ensure_config

from event_types.events import SSEEvent, sse_event_to_string
from utils.logger import logger

__all__ = ["emit_event", "sse_payload_to_wire"]

# 线协议约定的 custom event 名称
SSE_EVENT_NAME = "sse_event"


async def emit_event(event: SSEEvent, config: RunnableConfig | None = None) -> None:
    """发射一个结构化事件（节点内 await 调用）。

    事件统一序列化为 SSE 线格式，经 on_custom_event(name="sse_event") 送达消费端。
    无图执行上下文（缺 parent run id，如单元测试直调节点函数）时为 no-op。
    """
    payload = {"type": "sse", "event": sse_event_to_string(event)}
    try:
        cfg = config or ensure_config()
        await adispatch_custom_event(SSE_EVENT_NAME, payload, config=cfg)
    except RuntimeError:
        logger.debug("[EventStream] 无图执行上下文，事件未发射")


def sse_payload_to_wire(token: dict[str, Any]) -> str | None:
    """把消费端的 on_custom_event token 转为 SSE 线字符串。

    用法（astream_events 循环内）::

        if event_type == "on_custom_event" and name == "sse_event":
            wire = sse_payload_to_wire(token)
            if wire:
                yield wire
    """
    payload = token.get("data")
    if isinstance(payload, dict) and payload.get("type") == "sse":
        return payload.get("event")
    logger.debug("[EventStream] 忽略非 sse custom 事件: %s", type(payload).__name__)
    return None
