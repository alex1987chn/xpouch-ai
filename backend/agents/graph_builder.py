"""
工作流图构建：节点注册与边连接。
依赖 routing_policy（路由判定）与 tool_runtime（工具节点），与策略/运行时解耦。
"""

import logging
import pathlib
from functools import lru_cache

from dotenv import load_dotenv
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from agents.state import AgentState
from config import settings

logger = logging.getLogger(__name__)

env_path = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=env_path)
if settings.langchain_tracing_v2:
    settings.init_langsmith()


# ---------------------------------------------------------------------------
# LLM 延迟初始化（供 nodes 使用）
# ---------------------------------------------------------------------------


def get_router_llm_lazy():
    return _get_router_llm_cached()


def get_commander_llm_lazy():
    return _get_commander_llm_cached()


def get_simple_llm_lazy():
    return _get_simple_llm_cached()


@lru_cache(maxsize=1)
def _get_router_llm_cached():
    from utils.llm_factory import get_router_llm

    return get_router_llm()


@lru_cache(maxsize=1)
def _get_commander_llm_cached():
    from utils.llm_factory import get_commander_llm

    return get_commander_llm()


@lru_cache(maxsize=1)
def _get_simple_llm_cached():
    from providers_config import is_provider_configured
    from utils.llm_factory import get_llm_instance, get_router_llm

    try:
        if is_provider_configured("minimax"):
            return get_llm_instance(provider="minimax", streaming=True, temperature=0.7)
    except Exception:
        pass
    return get_router_llm()


# ---------------------------------------------------------------------------
# 图构建
# ---------------------------------------------------------------------------


def create_smart_router_workflow(
    checkpointer: BaseCheckpointSaver | None = None,
) -> StateGraph:
    """
    创建智能路由工作流（Router -> Commander -> HITL -> Dispatcher -> Generic -> Tools -> Aggregator）。
    """
    from agents.nodes import (
        aggregator_node,
        commander_node,
        direct_reply_node,
        expert_dispatcher_node,
        generic_worker_node,
        router_node,
    )
    from agents.routing_policy import route_generic, route_router
    from agents.tool_runtime import dynamic_tool_node

    workflow = StateGraph(AgentState)

    workflow.add_node("router", router_node)
    workflow.add_node("direct_reply", direct_reply_node)
    workflow.add_node("commander", commander_node)
    workflow.add_node("expert_dispatcher", expert_dispatcher_node)
    workflow.add_node("generic", generic_worker_node)
    workflow.add_node("aggregator", aggregator_node)
    workflow.add_node("tools", dynamic_tool_node)

    workflow.set_entry_point("router")

    workflow.add_conditional_edges(
        "router", route_router, {"direct_reply": "direct_reply", "commander": "commander"}
    )
    workflow.add_edge("direct_reply", END)
    workflow.add_edge("commander", "expert_dispatcher")
    workflow.add_edge("expert_dispatcher", "generic")
    workflow.add_conditional_edges(
        "generic",
        route_generic,
        {
            "tools": "tools",
            "generic": "generic",
            "expert_dispatcher": "expert_dispatcher",
            "aggregator": "aggregator",
        },
    )
    workflow.add_edge("tools", "generic")
    workflow.add_edge("aggregator", END)

    if checkpointer is None:
        logger.info("[Graph] Using MemorySaver (non-persistent, for dev/test only)")
        checkpointer = MemorySaver()
    else:
        logger.info("[Graph] Using persistent checkpointer: %s", type(checkpointer).__name__)

    compiled = workflow.compile(
        checkpointer=checkpointer,
        interrupt_before=["expert_dispatcher"],
    )
    return compiled


def get_default_commander_graph():
    """获取默认 commander graph（MemorySaver，缓存实例）。"""
    return _get_default_commander_graph_cached()


@lru_cache(maxsize=1)
def _get_default_commander_graph_cached():
    return create_smart_router_workflow()
