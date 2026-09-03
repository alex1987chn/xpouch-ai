"""事件流协议 v2 契约测试。

v1（state 携带 SSE 字符串 + on_chain_end 捞取）已被 custom stream 取代：
- 节点层唯一出口是 agents.event_stream.emit_event（内部 get_stream_writer）
- 节点源码不得再出现 event_queue 写入 / sse_event_to_string 直构
- 消费端（stream_service）必须以 stream_mode 含 custom 驱动图
state_patch 的不可变工具（replace_task_item 等）仍被任务列表更新使用，保留其测试。
"""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.state_patch import replace_task_item  # noqa: E402


def _read(path: str) -> str:
    return (BACKEND_ROOT / path).read_text(encoding="utf-8")


NODE_FILES = [
    "agents/nodes/router.py",
    "agents/nodes/commander.py",
    "agents/nodes/generic.py",
    "agents/nodes/aggregator.py",
]


def test_nodes_use_emit_event_as_sole_event_exit():
    for node_file in NODE_FILES:
        code = _read(node_file)
        assert "emit_event(" in code, f"{node_file} 应通过 emit_event 发射事件"
        assert "sse_event_to_string" not in code, f"{node_file} 不得直构 SSE 线格式"
        assert "append_sse_event" not in code, f"{node_file} 不得再写 event_queue"
        assert "get_event_queue_snapshot" not in code, f"{node_file} 不得读取 event_queue"


def test_stream_service_consumes_custom_stream():
    code = _read("services/chat/stream_service.py")
    assert '== "on_custom_event"' in code, "消费端应处理 on_custom_event（emit_event 出口）"
    assert "sse_payload_to_wire(" in code, "消费端应使用统一 payload 转换"


def test_emit_event_roundtrip_through_custom_stream():
    """emit_event → adispatch_custom_event → on_custom_event 全链路（真实 StateGraph）。"""
    import asyncio

    if sys.platform == "win32" and hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    from langgraph.graph import END, START, StateGraph
    from typing_extensions import TypedDict

    from agents.event_stream import emit_event, sse_payload_to_wire
    from utils.event_generator import event_router_start

    class _S(TypedDict):
        x: str

    async def _node(state: _S):
        await emit_event(event_router_start(query="契约测试"))
        return {"x": "done"}

    graph = StateGraph(_S)
    graph.add_node("n", _node)
    graph.add_edge(START, "n")
    graph.add_edge("n", END)
    compiled = graph.compile()

    async def _run():
        wires = []
        async for token in compiled.astream_events({"x": ""}, version="v2"):
            if token.get("event") == "on_custom_event" and token.get("name") == "sse_event":
                wire = sse_payload_to_wire(token)
                if wire:
                    wires.append(wire)
        return wires

    wires = asyncio.run(_run())
    assert len(wires) == 1
    assert wires[0].startswith("id: ")
    assert "event: router.start" in wires[0]
    assert "契约测试" in wires[0]


def test_emit_event_safe_outside_graph_context():
    """无图执行上下文时 no-op 不抛异常（单元测试/直调场景）。"""
    import asyncio

    from agents.event_stream import emit_event
    from utils.event_generator import event_router_start

    asyncio.run(emit_event(event_router_start(query="no-op")))  # 不应抛异常


def test_replace_task_item_returns_new_list_and_merges_fields():
    task_list = [
        {"id": "t1", "status": "pending", "meta": {"a": 1}},
        {"id": "t2", "status": "pending"},
    ]
    updated = replace_task_item(task_list, 0, {"status": "completed"})

    assert updated is not task_list
    assert updated[0]["id"] == "t1"
    assert updated[0]["status"] == "completed"
    assert task_list[0]["status"] == "pending"
