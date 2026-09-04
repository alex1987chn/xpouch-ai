"""
LangGraph 状态定义

集中管理所有 AgentState 类型定义，供 nodes/ 和 graph.py 共享
"""

from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """超智能体的全局状态"""

    messages: Annotated[list[BaseMessage], add_messages]
    task_list: list[dict[str, Any]]
    current_task_index: int
    strategy: str
    expert_results: list[dict[str, Any]]
    final_response: str
    # 记录路由决策信息
    router_decision: str
    # v3.0 新增：数据库持久化相关
    thread_id: str | None  # 关联的对话ID
    run_id: str | None  # 当前运行实例 ID
    user_id: str | None  # 当前用户 ID
    execution_plan_id: str | None  # 复杂执行计划 ID
    message_id: str | None  # 本次消息 ID（SSE 事件与 DB 消息关联，贯穿全图）
    # Stage 3 跨轮产物连续性：本会话最近产物的有界摘要（id/type/title/expert/内容头），
    # 供 Commander 规划时知晓可引用/可修改的既有产物；完整内容由专家经 get_artifact 按需读取
    recent_artifacts: list[dict[str, Any]]
    # 专家执行结果（正式 schema 键，随 checkpoint 持久化）：
    # 替代 v1 依赖 LangGraph"未知键过滤后在事件流 raw output 浮现"的隐式契约（__expert_info）
    last_expert_result: dict[str, Any]
    # v3.4 新增：用户模型偏好（simple 模式使用，来自 user_settings 表）
    simple_model: str | None  # 用户选择的模型 ID，None = 跟随系统默认
    simple_thinking: str | None  # 思考模式偏好：auto/enabled/disabled
    # v3.0 的 event_queue 已随事件协议 v2（emit_event/custom stream）移除
