"""producer 异常必须上抛（不得被粉饰成成功）——批次 E 静默降级清扫。

回归背景：`execute_langgraph_stream` 的 `producer()` 原为
`except AppError: raise / except Exception: logger.error(...)` 吞掉一切。
后果链：`finally` 仍会往 sse_queue 投 `{"type": "done"}` → 消费者收到 done 正常
退出 → `await producer_task` 正常返回（任务内异常已被捕）→ 恢复流程继续
`_process_collected_artifacts` → `_update_run_status(COMPLETED)` → 推 `[DONE]`。
于是**一次彻底失败的 HITL 恢复被标成 COMPLETED**：客户端收到干净的 [DONE]、
无 error 事件、无 message.done，而 recovery_service 里专门写好的
「标失败 + 推 RESUME_ERROR」分支永远不会执行。

本文件锁住不变量：**producer 内任何异常都必须传播到调用方**。
"""

import asyncio
from typing import Any

import pytest

from services.chat.stream_service import StreamService


class _BoomGraph:
    """astream_events 一调用就抛错的假图。"""

    async def astream_events(self, *args: Any, **kwargs: Any):
        raise RuntimeError("producer 内部故障")
        yield  # pragma: no cover —— 使其成为 async generator


def _service() -> StreamService:
    svc = StreamService.__new__(StreamService)  # 不触碰 db
    svc.db = None
    return svc


def _run(monkeypatch, svc: StreamService) -> None:
    async def _fake_mcp_tools() -> list:
        return []

    monkeypatch.setattr(svc, "_get_mcp_tools", _fake_mcp_tools)
    monkeypatch.setattr(
        "agents.graph_builder.create_smart_router_workflow", lambda **_kwargs: _BoomGraph()
    )
    monkeypatch.setattr("utils.db.get_shared_checkpointer", lambda: object())

    async def _drain() -> None:
        async for _ in svc.execute_langgraph_stream(
            thread_id="t-1",
            stream_queue=asyncio.Queue(),
            sse_queue=asyncio.Queue(),
            realtime_queue=asyncio.Queue(),
            run_id=None,  # 避免触发 run 级副作用
        ):
            pass

    asyncio.run(_drain())


class TestProducerFailurePropagates:
    def test_exception_reaches_caller(self, monkeypatch):
        """核心回归：producer 内部异常必须冒泡，而不是只记一条 error 日志。"""
        with pytest.raises(RuntimeError, match="producer 内部故障"):
            _run(monkeypatch, _service())

    def test_app_error_also_propagates(self, monkeypatch):
        """AppError 同样上抛（此前显式 re-raise，改为统一不捕获后仍须成立）。"""

        class _AppErrGraph:
            async def astream_events(self, *args: Any, **kwargs: Any):
                from utils.error_codes import ErrorCode
                from utils.exceptions import AppError

                raise AppError(message="取消", code=ErrorCode.RUN_CANCELLED, status_code=409)
                yield  # pragma: no cover

        svc = _service()

        async def _fake_mcp_tools() -> list:
            return []

        monkeypatch.setattr(svc, "_get_mcp_tools", _fake_mcp_tools)
        monkeypatch.setattr(
            "agents.graph_builder.create_smart_router_workflow", lambda **_kwargs: _AppErrGraph()
        )
        monkeypatch.setattr("utils.db.get_shared_checkpointer", lambda: object())

        from utils.exceptions import AppError

        async def _drain() -> None:
            async for _ in svc.execute_langgraph_stream(
                thread_id="t-1",
                stream_queue=asyncio.Queue(),
                sse_queue=asyncio.Queue(),
                realtime_queue=asyncio.Queue(),
                run_id=None,
            ):
                pass

        with pytest.raises(AppError):
            asyncio.run(_drain())
