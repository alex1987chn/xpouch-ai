"""RunContext —— 一次执行上下文的值对象（StreamService 拆解余项，2026-10-05）。

为什么存在：恢复路径的参数簇（thread_id / run_id / 三条队列）全是同型
或近型的纯值，位置传参错位既不被类型检查捕获、也不在运行时报错——
落库时张冠李戴才是发现方式。捆成一个 frozen 值对象后：

- 调用边界的错位在结构上不可能（字段名取值，没有位置语义）
- 后续增加 run 级事实（如附件、追踪 id）不再横扫所有调用方签名

边界：只装「贯穿整次执行」的纯值。会话级资源（db session）、请求级
内容（user_message）、流参数（stream_timeout）不入内。初始执行路径
（handle_langgraph_stream）的参数簇含 ORM 对象（thread/agent_run），
形状不同、错位可被类型检查捕获，刻意不并入。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass


@dataclass(frozen=True)
class RunContext:
    """一次 LangGraph 执行（恢复/续跑）的上下文簇。"""

    thread_id: str
    run_id: str | None
    stream_queue: asyncio.Queue
    sse_queue: asyncio.Queue
    realtime_queue: asyncio.Queue
