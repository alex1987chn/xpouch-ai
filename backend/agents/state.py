"""
LangGraph 状态定义

集中管理所有 AgentState 类型定义，供 nodes/ 和 graph.py 共享
"""
from typing import TypedDict, Annotated, List, Dict, Any, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """超智能体的全局状态"""
    messages: Annotated[List[BaseMessage], add_messages]
    task_list: List[Dict[str, Any]]
    current_task_index: int
    strategy: str
    expert_results: List[Dict[str, Any]]
    final_response: str
    # 记录路由决策信息
    router_decision: str
    # v3.0 新增：数据库持久化相关
    thread_id: Optional[str]           # 关联的对话ID
    task_session_id: Optional[str]     # 任务会话ID
    # v3.0 新增：事件队列（用于 SSE 推送）
    event_queue: List[Dict[str, Any]]  # 待发送的事件列表
