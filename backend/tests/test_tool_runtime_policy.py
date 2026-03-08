import asyncio

from langchain_core.messages import AIMessage, ToolMessage

from agents import tool_runtime


class _DummyTool:
    def __init__(self, name: str, description: str = ""):
        self.name = name
        self.description = description


def test_dynamic_tool_node_blocks_high_risk_tool_without_invoking_executor(monkeypatch):
    class _FailingToolNode:
        def __init__(self, _tools):
            raise AssertionError("ToolNode should not be constructed when policy blocks the call")

    monkeypatch.setattr(tool_runtime, "ToolNode", _FailingToolNode)

    state = {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": "call-1",
                        "name": "filesystem_write",
                        "args": {"path": "notes.txt", "content": "hello"},
                    }
                ],
            )
        ],
        "task_list": [{"expert_type": "writer"}],
        "current_task_index": 0,
    }
    config = {"configurable": {"mcp_tools": [_DummyTool("filesystem_write", "写入本地文件")]}}

    result = asyncio.run(tool_runtime.dynamic_tool_node(state, config))

    assert len(result["messages"]) == 1
    message = result["messages"][0]
    assert isinstance(message, ToolMessage)
    assert "额外审批" in message.content


def test_dynamic_tool_node_blocks_builtin_tool_for_memorize_expert(monkeypatch):
    class _FailingToolNode:
        def __init__(self, _tools):
            raise AssertionError("ToolNode should not be constructed when policy blocks the call")

    monkeypatch.setattr(tool_runtime, "ToolNode", _FailingToolNode)

    state = {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": "call-1",
                        "name": "search_web",
                        "args": {"query": "杭州天气"},
                    }
                ],
            )
        ],
        "task_list": [{"expert_type": "memorize_expert"}],
        "current_task_index": 0,
    }

    result = asyncio.run(tool_runtime.dynamic_tool_node(state, None))

    assert len(result["messages"]) == 1
    message = result["messages"][0]
    assert isinstance(message, ToolMessage)
    assert "策略拒绝" in message.content
