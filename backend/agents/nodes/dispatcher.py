"""
Expert Dispatcher 节点 - 专家分发器

支持显式依赖关系（DAG），自动注入前置任务输出到上下文

v3.2 重构：移除对 dynamic_experts.py 的依赖
仅负责检查专家存在，流转逻辑由 graph.py 决定
v3.3 更新：使用独立数据库会话，避免 MemorySaver 序列化问题
"""
from typing import Dict, Any
from agents.state import AgentState
from agents.services.expert_manager import get_expert_config, get_expert_config_cached
from utils.exceptions import AppError
from database import engine
from sqlmodel import Session


async def expert_dispatcher_node(state: AgentState) -> Dict[str, Any]:
    """
    专家分发器节点（简化版）

    v3.2 重构：
    - 移除专家执行逻辑（不再调用专家函数）
    - 仅负责检查专家是否存在并返回空字典
    - 流转逻辑由 graph.py 中的连线决定
    
    v3.3 更新：
    - 使用独立数据库会话，避免 MemorySaver 序列化问题
    """
    task_list = state["task_list"]
    current_index = state["current_task_index"]
    
    # 检查是否还有任务
    if current_index >= len(task_list):
        return {}

    current_task = task_list[current_index]
    expert_type = current_task["expert_type"]
    description = current_task["description"]
    
    # 🔥 使用独立的数据库会话（避免 MemorySaver 序列化问题）
    try:
        with Session(engine) as db_session:
            expert_config = get_expert_config(expert_type, db_session)
        
        if not expert_config:
            # 缓存回退
            expert_config = get_expert_config_cached(expert_type)
        
        if not expert_config:
            print(f"[Dispatcher] 专家 '{expert_type}' 不存在")
            raise Exception(f"Expert '{expert_type}' not found")
        
        print(f"[Dispatcher] 任务 [{current_index + 1}/{len(task_list)}] - {expert_type}: {description}")
        print(f"[Dispatcher] 专家存在，继续流转到下一个节点")

        # 返回空字典，让 Generic Worker 继续执行
        return {}

    except Exception as e:
        print(f"[Dispatcher] 检查专家失败: {e}")
        raise AppError(message=f"专家配置错误: {str(e)}", code="EXPERT_NOT_FOUND")
