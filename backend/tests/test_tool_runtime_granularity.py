"""工具运行时：按单个 tool_call 的超时与重试（批次 E）。

回归背景：原实现用 `asyncio.timeout` 包住**整次 ToolNode 调用**，并把重试也施加
在整批上。后果是——一次请求里若 LLM 返回多个 tool_call，其中第 3 个失败时，
**前 2 个已成功的会被再执行一遍**（写类外部工具即重复副作用）。同时超时值按
「本 run 是否挂了 MCP」二选一，挂了 MCP 时连本地工具也一起放宽。

本文件锁住修正后的粒度：每个 tool_call 独立计时、独立重试，失败互不影响；
错误消息由 ToolNode 生成，tool_call_id 正确（不再是 "unknown" 兜底）。
"""

import asyncio
from typing import Annotated, TypedDict

import httpx
import pytest
from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from agents.tool_runtime import (
    BASE_TOOL_TIMEOUT,
    MCP_TOOL_TIMEOUT,
    build_tool_call_wrapper,
    is_retryable_error,
)


def _state(*calls: tuple[str, str]) -> dict:
    """构造带 tool_calls 的状态：calls = [(tool_name, call_id), ...]"""
    return {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[
                    {"name": name, "args": {}, "id": call_id, "type": "tool_call"}
                    for name, call_id in calls
                ],
            )
        ]
    }


@pytest.fixture
def counters() -> dict[str, int]:
    return {}


def _make_executor(counters: dict[str, int], extra_tools: list | None = None) -> ToolNode:
    """构造带计数器的 ToolNode，用于观测每个工具被真正执行了几次。"""

    @tool
    async def ok_tool() -> str:
        """总是成功的工具。"""
        counters["ok"] = counters.get("ok", 0) + 1
        return "ok-result"

    tools = [ok_tool] + list(extra_tools or [])
    return ToolNode(
        tools,
        handle_tool_errors=False,
        awrap_tool_call=build_tool_call_wrapper({t.name for t in tools}),
    )


class _ToolState(TypedDict):
    messages: Annotated[list, add_messages]


def _invoke(executor: ToolNode, state: dict) -> dict:
    """经最小图调用 ToolNode，而非直接 ainvoke。

    直接调会抛 "Missing required config key 'N/A' for 'tools'"——工具的参数注入
    依赖图运行时上下文。经图调用既绕开该问题，也更贴近生产（tools 节点本就在
    图里执行）。
    """
    graph = StateGraph(_ToolState)
    graph.add_node("tools", executor)
    graph.set_entry_point("tools")
    graph.add_edge("tools", END)
    app = graph.compile()
    return asyncio.run(app.ainvoke(state))


def _tool_messages(result: dict) -> list:
    """只取工具产出的 ToolMessage（add_messages 会保留输入的 AIMessage）。"""
    from langchain_core.messages import ToolMessage

    return [m for m in result["messages"] if isinstance(m, ToolMessage)]


def _result_texts(result: dict) -> list[str]:
    return [m.content for m in _tool_messages(result)]


class TestPerToolCallIsolation:
    """核心回归：失败的那一个调用重试，已成功的调用不得重跑。"""

    def test_successful_call_is_not_re_executed_when_sibling_retries(self, counters):
        attempts = {"n": 0}

        @tool
        async def flaky_tool() -> str:
            """首次失败（可重试错误），第二次成功。"""
            attempts["n"] += 1
            if attempts["n"] == 1:
                raise httpx.ConnectError("boom")
            return "flaky-recovered"

        executor = _make_executor(counters, [flaky_tool])
        # 同批两个调用：ok_tool（会成功） + flaky_tool（先失败后成功）
        result = _invoke(executor, _state(("ok_tool", "c1"), ("flaky_tool", "c2")))

        assert counters["ok"] == 1, "已成功的调用不得因同批失败而重跑"
        assert attempts["n"] == 2, "失败的那个调用应重试一次"
        assert "ok-result" in _result_texts(result)
        assert "flaky-recovered" in _result_texts(result)

    def test_failing_call_does_not_abort_sibling(self, counters):
        @tool
        async def broken_tool() -> str:
            """不可重试的错误。"""
            raise ValueError("nope")

        executor = _make_executor(counters, [broken_tool])
        result = _invoke(executor, _state(("ok_tool", "c1"), ("broken_tool", "c2")))

        assert counters["ok"] == 1, "兄弟工具应照常执行"
        assert "ok-result" in _result_texts(result)


class TestErrorMessages:
    """错误消息由 ToolNode 生成：tool_call_id 正确、status=error。"""

    def test_error_message_keeps_real_tool_call_id(self, counters):
        @tool
        async def broken_tool() -> str:
            """不可重试的错误。"""
            raise ValueError("nope")

        executor = _make_executor(counters, [broken_tool])
        result = _invoke(executor, _state(("broken_tool", "call-xyz")))

        err_msg = next(m for m in _tool_messages(result) if m.tool_call_id == "call-xyz")
        assert err_msg.status == "error"
        assert "nope" in err_msg.content, "应带上分类后的用户可读文案"
        assert all(m.tool_call_id != "unknown" for m in _tool_messages(result))

    def test_error_message_is_user_facing_chinese(self, counters):
        @tool
        async def broken_tool() -> str:
            """不可重试的错误。"""
            raise ValueError("internal detail")

        executor = _make_executor(counters, [broken_tool])
        result = _invoke(executor, _state(("broken_tool", "c1")))

        content = _tool_messages(result)[0].content
        assert "工具执行时出错" in content


class TestTimeoutGranularity:
    """超时按单个工具选取：内置与 MCP 各自独立，互不拖宽。"""

    def test_timeout_value_is_chosen_per_tool(self, monkeypatch):
        """同一个慢工具：算作内置工具时超时，算作 MCP 工具时通过。

        这是「超时不再被同批 MCP 工具拖宽、也不再一刀切」的直接证据。
        """
        monkeypatch.setattr("agents.tool_runtime.BASE_TOOL_TIMEOUT", 1)
        monkeypatch.setattr("agents.tool_runtime.MCP_TOOL_TIMEOUT", 3)

        @tool
        async def slow_tool() -> str:
            """耗时 1.5s：内置预算 1s 会超时，MCP 预算 3s 能过。"""
            await asyncio.sleep(1.5)
            return "done"

        # 当作内置工具（在 builtin_tool_names 中）→ 用 BASE_TOOL_TIMEOUT
        builtin_executor = ToolNode(
            [slow_tool],
            handle_tool_errors=False,
            awrap_tool_call=build_tool_call_wrapper({"slow_tool"}),
        )
        builtin_result = _invoke(builtin_executor, _state(("slow_tool", "c1")))
        assert _tool_messages(builtin_result)[0].status == "error"
        assert "超时" in _tool_messages(builtin_result)[0].content

        # 当作 MCP 工具（不在 builtin 集合中）→ 用 MCP_TOOL_TIMEOUT
        mcp_executor = ToolNode(
            [slow_tool],
            handle_tool_errors=False,
            awrap_tool_call=build_tool_call_wrapper(set()),
        )
        mcp_result = _invoke(mcp_executor, _state(("slow_tool", "c1")))
        assert _tool_messages(mcp_result)[0].content == "done"

    def test_timeout_is_not_retried(self, monkeypatch, counters):
        """超时不做重试（重试只会把最坏耗时翻倍）——保持快速失败。"""
        monkeypatch.setattr("agents.tool_runtime.BASE_TOOL_TIMEOUT", 1)
        calls = {"n": 0}

        @tool
        async def slow_tool() -> str:
            """每次都会超时。"""
            calls["n"] += 1
            await asyncio.sleep(5)
            return "never"

        executor = _make_executor(counters, [slow_tool])
        _invoke(executor, _state(("slow_tool", "c1")))

        assert calls["n"] == 1, "超时不应触发重试"


class TestRetryableClassification:
    def test_timeout_error_is_not_retryable(self):
        assert is_retryable_error(TimeoutError()) is False

    def test_network_errors_are_retryable(self):
        assert is_retryable_error(httpx.ConnectError("x")) is True
        assert is_retryable_error(httpx.ConnectTimeout("x")) is True
        assert is_retryable_error(httpx.TimeoutException("x")) is True

    def test_application_errors_are_not_retryable(self):
        assert is_retryable_error(ValueError("x")) is False


class TestTimeoutConstants:
    def test_mcp_budget_exceeds_builtin(self):
        assert MCP_TOOL_TIMEOUT > BASE_TOOL_TIMEOUT
