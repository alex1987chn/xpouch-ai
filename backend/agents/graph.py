"""
XPouch AI LangGraph 工作流入口 (v3.1.0)

本模块为兼容层，实际实现已拆分为：
- graph_builder: 图构建与 LLM 延迟初始化
- routing_policy: 条件路由与工具循环熔断
- tool_runtime: 动态工具节点（超时/重试/错误降级）

[入口]
- create_smart_router_workflow(): 创建完整工作流（支持 HITL）
- get_default_commander_graph(): 默认图实例（MemorySaver）
"""
from agents.graph_builder import (
    create_smart_router_workflow,
    get_commander_llm_lazy,
    get_default_commander_graph,
    get_router_llm_lazy,
    get_simple_llm_lazy,
)
from agents.routing_policy import _should_trip_tool_loop_guard

__all__ = [
    "create_smart_router_workflow",
    "get_default_commander_graph",
    "get_router_llm_lazy",
    "get_commander_llm_lazy",
    "get_simple_llm_lazy",
    "_should_trip_tool_loop_guard",
]
