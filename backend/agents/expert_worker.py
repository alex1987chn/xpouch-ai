"""专家执行子图：一个任务 = 一次 `worker ↔ tools` 的工具循环。

## 为什么必须是子图

主图按依赖波次把**同层多个任务**并发扇出（`Send`），而 `Send` 只让分支跑**一个
节点**——框架没有「每个分支拥有自己的循环」这种构造。所以「一个任务 = 多步工具
循环」只能在子图里表达，Send 的目标是该子图。

## 分支的状态边界（三条硬约束，实测得出）

1. **分支只能看到 Send payload**：LangGraph 的 Send 目标拿到的是 payload 本身，
   读不到主图其它通道的值（已实测：payload 未提供的键在分支里是 None）。
   所以父图在扇出前把「本任务 + 已解析好的上游输出 + 运行标识」放进 payload
   （见 `agents/nodes/wave_scheduler.py`）。
2. **分支的草稿消息必须私有**：工具调用往返放在 `worker_messages`，不写主图
   `messages`（那是会话历史）。N 个并发分支往同一通道写既冲突也无意义——消息
   顺序会变成完成顺序。
3. **分支只经 `task_outcomes` 交回结果**：并发写无 reducer 的通道会
   `InvalidUpdateError`（已实测），且 `task_list` 需要「计划编辑整表替换」语义，
   不能加按 key 合并的 reducer。产物形状见 `agents/task_outcome.py`。

## 与主图的同名通道

子图里声明的键若主图也有，则按**主图的规约**写回（`task_outcomes` 因此用同一个
`merge_task_outcomes`）；主图没有的键（`current_task` / `worker_messages` 等）
不写回，天然是分支私有。子图**不注册 checkpointer**：分支的检查点由主图统一管。
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from agents.nodes.generic import expert_worker_node
from agents.state import merge_task_outcomes
from agents.tool_runtime import dynamic_tool_node

WORKER_NODE = "worker"
TOOLS_NODE = "tools"


class ExpertWorkerState(TypedDict, total=False):
    """分支状态（Send payload 提供只读输入，其余为分支私有草稿）。"""

    # --- Send payload 注入（只读）---
    current_task: dict[str, Any]
    # 已解析好的上游输出：{依赖 key: 输出文本}。分支读不到主图状态，故随 payload 带
    dependency_outputs: dict[str, str]
    # 运行标识打包（thread_id / run_id / execution_plan_id / user_id）
    #
    # ⚠️ 为什么打包成一个键而不是四个平铺键（实测踩过，别改回去）：
    # 子图把自己 schema 里**与主图同名的键**全部写回主图——不是只写本节点返回的那些。
    # 因此把 `thread_id` 平铺进分支 schema，N 个并发分支就会往主图那个无 reducer 的
    # 通道并发写同一个值，直接 `InvalidUpdateError: At key 'thread_id'`。
    # 打包成主图没有的私有键后，它天然不回写（主图只收它声明的键）。
    branch_context: dict[str, Any]
    # --- 分支私有草稿 ---
    # 工具循环的消息（不进主图 messages；见模块 docstring 第 2 条）
    worker_messages: Annotated[list[BaseMessage], add_messages]
    # 是否已发过 task.started：工具循环重入本节点时据此跳过重复事件与账本写入
    worker_started: bool
    # --- 交回主图 ---
    task_outcomes: Annotated[dict[str, dict[str, Any]], merge_task_outcomes]


async def worker_tools_node(state: ExpertWorkerState, config: RunnableConfig = None) -> dict:
    """工具节点适配层。

    `dynamic_tool_node`（含 ToolNode）读写的是 `messages`，而分支的草稿在
    `worker_messages`。这层只做键名搬运，工具治理/超时/重试逻辑一行不改。
    """
    tool_state = {**state, "messages": state.get("worker_messages") or []}
    result = await dynamic_tool_node(tool_state, config)
    return {"worker_messages": result.get("messages") or []}


def route_worker(state: ExpertWorkerState) -> str:
    """分支内路由：已产出 outcome → 结束；还在要工具 → tools。

    注意工具循环守卫**不在这里**：它在本节点内决定「本任务不再绑工具」（见
    `generic.expert_worker_node`）。若放在路由里「熔断 → 结束整轮」，一个任务的
    工具失控就会带走整份计划里其余任务的结果。
    """
    if state.get("task_outcomes"):
        return END
    messages = state.get("worker_messages") or []
    last = messages[-1] if messages else None
    if last is not None and getattr(last, "tool_calls", None):
        return TOOLS_NODE
    return END


def build_expert_worker_subgraph():
    """编译执行子图。

    **不要给它挂节点级超时**：那会让单个慢任务拖死整轮；超时在节点内部按任务级
    失败处理（`asyncio.timeout` → ExpertExecutionError → failed 产物）。
    """
    builder = StateGraph(ExpertWorkerState)
    builder.add_node(WORKER_NODE, expert_worker_node)
    builder.add_node(TOOLS_NODE, worker_tools_node)
    builder.set_entry_point(WORKER_NODE)
    builder.add_conditional_edges(WORKER_NODE, route_worker, {TOOLS_NODE: TOOLS_NODE, END: END})
    builder.add_edge(TOOLS_NODE, WORKER_NODE)
    return builder.compile()
