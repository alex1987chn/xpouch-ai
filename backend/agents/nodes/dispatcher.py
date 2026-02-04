"""
Expert Dispatcher 节点 - 专家分发器

支持显式依赖关系（DAG），自动注入前置任务输出到上下文
"""
from typing import Dict, Any
from datetime import datetime

from agents.nodes.state import AgentState


async def expert_dispatcher_node(state: AgentState) -> Dict[str, Any]:
    """
    专家分发器节点
    v3.1 更新：支持显式依赖关系（DAG），自动注入前置任务输出到上下文
    
    注意：此节点目前从 graph.py 导入实际实现，
    未来可完全迁移到此处
    """
    # 临时方案：从 graph.py 导入实际实现，避免循环依赖
    from agents.graph import expert_dispatcher_node as _expert_dispatcher_impl
    return await _expert_dispatcher_impl(state)
