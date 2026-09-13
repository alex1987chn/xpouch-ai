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
from langgraph.types import TimeoutPolicy

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
        # 2026-09: MiniMax 已停用（余额耗尽、效果一般），Simple 模式改用 DeepSeek
        # streaming=True 必需：direct_reply 的内容经 on_chat_model_stream →
        # message.delta 逐字送达前端（simple 模式唯一流式来源）
        if is_provider_configured("deepseek"):
            return get_llm_instance(provider="deepseek", streaming=True, temperature=0.7)
    except Exception as exc:
        # 这里曾是 `except Exception: pass`——全仓唯一连日志都没有的吞异常。
        # 后果：simple 模式静默换用 router LLM（其 streaming 多为 False），
        # **逐字流式消失**（回复整段突然出现），且模型/温度也可能与配置不符，
        # 而没有任何线索可查。注意措辞要说出降级后果。
        logger.warning(
            "[Graph] simple 模式 LLM 构造失败，回落 router LLM"
            "（可能失去逐字流式，请核对 provider 配置）: %s",
            exc,
            exc_info=True,
        )
    return get_router_llm()


# ---------------------------------------------------------------------------
# 图构建
# ---------------------------------------------------------------------------


def create_smart_router_workflow(
    checkpointer: BaseCheckpointSaver | None = None,
) -> StateGraph:
    """
    创建智能路由工作流。

    拓扑（C2 起：执行侧按依赖波次扇出）::

        router → {direct_reply | commander → plan_approval → wave_dispatch}
        wave_dispatch ──Send──▶ expert_worker（子图：worker ↔ tools）──▶ task_join
             ▲                                                              │
             └──────────────────────────────────────────────────────────────┘
        wave_dispatch（无就绪任务）→ aggregator → END

    与旧拓扑（dispatcher + generic + current_task_index 游标）的对应关系：
    - `expert_dispatcher` 的「专家是否存在」检查并入 expert_worker（它本来就要加载
      专家配置，配不到就产出 failed 产物），任务切换由波次判定接管。
    - `generic`/`tools` 的循环搬进 `expert_worker` 子图：`Send` 只让分支跑一个节点，
      一个任务的多步工具循环只能在子图里表达。
    - `current_task_index` 游标删除：选中哪些任务由 `plan_waves` 按依赖算（决定 5）。
    """
    from agents.expert_worker import build_expert_worker_subgraph
    from agents.nodes import (
        aggregator_node,
        commander_node,
        direct_reply_node,
        plan_approval_node,
        router_node,
        task_join_node,
        wave_dispatch_node,
    )
    from agents.nodes.wave_scheduler import AGGREGATOR_NODE, EXPERT_WORKER_NODE, route_wave
    from agents.routing_policy import route_router

    # 节点级超时（LangGraph 原生 TimeoutPolicy）——只给「挂了整轮无救」的节点：
    #   commander：规划环节悬挂 → 后面无计划可批，快速失败并报清晰错误
    #   aggregator：聚合环节悬挂 → 无最终产出，同上
    # 不给专家执行用（含子图）：那会让单个慢任务拖死整轮；它的超时放在节点内部，
    # 走任务级失败（该任务失败、其余照常执行）。
    node_timeout = TimeoutPolicy(run_timeout=settings.llm_call_timeout_seconds)

    workflow = StateGraph(AgentState)

    workflow.add_node("router", router_node)
    workflow.add_node("direct_reply", direct_reply_node)
    workflow.add_node("commander", commander_node, timeout=node_timeout)
    workflow.add_node("plan_approval", plan_approval_node)
    workflow.add_node("wave_dispatch", wave_dispatch_node)
    # 执行子图：一个任务 = 一次 worker ↔ tools 的工具循环
    workflow.add_node(EXPERT_WORKER_NODE, build_expert_worker_subgraph())
    workflow.add_node("task_join", task_join_node)
    workflow.add_node("aggregator", aggregator_node, timeout=node_timeout)

    workflow.set_entry_point("router")

    workflow.add_conditional_edges(
        "router", route_router, {"direct_reply": "direct_reply", "commander": "commander"}
    )
    workflow.add_edge("direct_reply", END)
    # 审批点独立成节点：规划完成后必须先过人工裁决。
    # 任务波次推进的回路是 task_join → wave_dispatch，天然**绕过** plan_approval，
    # 因此「要不要问人」由图拓扑表达，不再需要运行时位置判断。
    workflow.add_edge("commander", "plan_approval")
    workflow.add_edge("plan_approval", "wave_dispatch")
    # 条件边返回 Send 列表 = 并发扇出本轮任务；返回节点名 = 无就绪任务，转聚合
    workflow.add_conditional_edges(
        "wave_dispatch",
        route_wave,
        {EXPERT_WORKER_NODE: EXPERT_WORKER_NODE, AGGREGATOR_NODE: AGGREGATOR_NODE},
    )
    # 扇入：等本轮所有分支都产出后再落状态
    workflow.add_edge(EXPERT_WORKER_NODE, "task_join")
    workflow.add_edge("task_join", "wave_dispatch")
    workflow.add_edge("aggregator", END)

    if checkpointer is None:
        logger.info("[Graph] Using MemorySaver (non-persistent, for dev/test only)")
        checkpointer = MemorySaver()
    else:
        logger.info("[Graph] Using persistent checkpointer: %s", type(checkpointer).__name__)

    compiled = workflow.compile(checkpointer=checkpointer)
    return compiled


def get_default_commander_graph():
    """获取默认 commander graph（MemorySaver，缓存实例）。"""
    return _get_default_commander_graph_cached()


@lru_cache(maxsize=1)
def _get_default_commander_graph_cached():
    return create_smart_router_workflow()
