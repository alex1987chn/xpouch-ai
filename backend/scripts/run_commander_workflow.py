"""
本地调试：执行 Commander 工作流（简单/复杂各跑一次）。
原逻辑来自 agents/graph.py 的 __main__ 与 execute_commander_workflow。
"""
import asyncio
import logging
from typing import Any

from langchain_core.messages import HumanMessage
from langgraph.checkpoint.base import BaseCheckpointSaver

from agents.graph_builder import create_smart_router_workflow, get_default_commander_graph
from agents.state import AgentState

logger = logging.getLogger(__name__)


async def execute_commander_workflow(
    user_query: str,
    thread_id: str = "test_thread",
    checkpointer: BaseCheckpointSaver | None = None,
) -> dict[str, Any]:
    """执行 Commander 工作流，返回最终状态。"""
    logger.info("--- [START] 查询: %s ---", user_query)

    if checkpointer:
        graph = create_smart_router_workflow(checkpointer=checkpointer)
    else:
        graph = get_default_commander_graph()

    initial_state: AgentState = {
        "messages": [HumanMessage(content=user_query)],
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": "",
    }

    final_state = await graph.ainvoke(
        initial_state,
        config={
            "recursion_limit": 100,
            "configurable": {"thread_id": thread_id},
        },
    )
    logger.info("--- [DONE] ---")
    return final_state


if __name__ == "__main__":
    async def test():
        logger.info("\n=== 测试 1: 简单模式 ===")
        await execute_commander_workflow("你好，在吗？")

        logger.info("\n=== 测试 2: 复杂模式 ===")
        await execute_commander_workflow("帮我写一个 Python 脚本来抓取股票价格。")

    asyncio.run(test())
