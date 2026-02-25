"""
Expert Dispatcher 节点 - 专家分发器

支持显式依赖关系（DAG），自动注入前置任务输出到上下文

v3.2 重构：移除对 dynamic_experts.py 的依赖
仅负责检查专家存在，流转逻辑由 graph.py 决定
v3.3 更新：使用独立数据库会话，避免 MemorySaver 序列化问题
"""
from typing import Dict, Any
from langchain_core.runnables import RunnableConfig
from agents.state import AgentState
from agents.services.expert_manager import get_expert_config, get_expert_config_cached
from utils.exceptions import AppError
from database import engine
from sqlmodel import Session


async def expert_dispatcher_node(state: AgentState, config: RunnableConfig = None) -> Dict[str, Any]:
    """
    专家分发器节点（简化版）

    P1 优化: 统一 Node 签名，添加 config 参数
    
    v3.2 重构：
    - 移除专家执行逻辑（不再调用专家函数）
    - 仅负责检查专家是否存在并返回空字典
    - 流转逻辑由 graph.py 中的连线决定
    
    v3.3 更新：
    - 使用独立数据库会话，避免 MemorySaver 序列化问题
    """
    task_list = state["task_list"]
    current_index = state["current_task_index"]
    
    print(f"[DISPATCHER_NODE] 进入节点, current_index={current_index}, task_count={len(task_list)}")
    
    # 检查是否还有任务
    if current_index >= len(task_list):
        print(f"[DISPATCHER_NODE] 没有更多任务，返回空字典")
        return {}

    current_task = task_list[current_index]
    expert_type = current_task["expert_type"]
    description = current_task["description"]
    
    print(f"[DISPATCHER_NODE] 当前任务: {expert_type}, status={current_task.get('status')}")
    
    # 🔥 使用独立的数据库会话（避免 MemorySaver 序列化问题）
    try:
        print(f"[DISPATCHER_NODE] 开始加载专家配置...")
        with Session(engine) as db_session:
            expert_config = get_expert_config(expert_type, db_session)
        
        if not expert_config:
            # 缓存回退
            print(f"[DISPATCHER_NODE] 数据库未找到，尝试缓存...")
            expert_config = get_expert_config_cached(expert_type)
        
        if not expert_config:
            print(f"[DISPATCHER_NODE] 专家 '{expert_type}' 不存在")
            raise Exception(f"Expert '{expert_type}' not found")
        
        print(f"[DISPATCHER_NODE] 专家配置加载成功，准备返回")
        print(f"[Dispatcher] 任务 [{current_index + 1}/{len(task_list)}] - {expert_type}: {description}")
        print(f"[Dispatcher] 专家存在，继续流转到下一个节点")

        # 返回空字典，让 Generic Worker 继续执行
        print(f"[DISPATCHER_NODE] 返回空字典，流程将继续到 generic")
        return {}

    except Exception as e:
        print(f"[DISPATCHER_NODE] 检查专家失败: {e}")
        import traceback
        traceback.print_exc()
        raise AppError(message=f"专家配置错误: {str(e)}", code="EXPERT_NOT_FOUND")
