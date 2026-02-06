"""
Router 节点 - 意图识别

负责将用户输入分类为 simple 或 complex 模式
集成长期记忆检索，提供个性化路由决策
"""
from typing import Dict, Any, Literal
from datetime import datetime
from langchain_core.messages import SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

from agents.state import AgentState
from constants import ROUTER_SYSTEM_PROMPT, DEFAULT_ASSISTANT_PROMPT
from services.memory_manager import memory_manager  # 🔥 导入记忆管理器


def _inject_current_time(system_prompt: str) -> str:
    """
    在 System Prompt 中注入当前时间

    让 LLM 知道当前的确切时间，自动将"今天"、"昨天"等相对时间转换为具体日期
    """
    now = datetime.now()
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    weekday_str = weekdays[now.weekday()]

    # 格式化时间：2026年02月06日 14:30:00 星期五
    time_str = now.strftime(f"%Y年%m月%d日 %H:%M:%S {weekday_str}")
    date_str = now.strftime("%Y-%m-%d")

    # 构建增强的 System Prompt
    enhanced_prompt = f"""【当前系统时间】：{time_str}
【当前日期】：{date_str}

{system_prompt}

【时间处理指令】：
- 如果用户询问"今天"、"昨天"或"最近"的新闻/事件，请根据【当前日期】将相对时间转换为具体日期格式（如 "{date_str}"）
- 调用搜索工具时，请使用具体日期而非相对时间（例如："{date_str} AI新闻" 而不是 "今天的新闻"）
- 这会帮助搜索工具返回更精准的结果
"""

    return enhanced_prompt


class RoutingDecision(BaseModel):
    """v2.7 网关决策结构（Router只负责分类）"""
    decision_type: Literal["simple", "complex"] = Field(description="决策类型")


async def router_node(state: AgentState) -> Dict[str, Any]:
    """
    [网关] 只负责分类，不负责回答
    
    根据用户输入判断应该使用 simple 模式（直接回复）
    还是 complex 模式（多专家协作）
    
    🔥 新增：检索长期记忆，提供个性化决策
    """
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if hasattr(last_message, 'content') else str(last_message)

    # 断点恢复检查
    if state.get("task_list") and len(state.get("task_list", [])) > 0:
        return {"router_decision": "complex"}

    # 🔥 从 state 获取 user_id（如果存在），否则使用默认值
    # 后续可以从请求 header 或上下文传递 user_id
    user_id = state.get("user_id", "default_user")

    print(f"--- [Router] 正在思考: {user_query[:100]}... ---")

    # 1. 🔥 检索长期记忆（异步）
    try:
        relevant_memories = await memory_manager.search_relevant_memories(user_id, user_query, limit=3)
    except Exception as e:
        print(f"[Router] 记忆检索失败: {e}")
        relevant_memories = ""

    # 2. 🔥 构建 System Prompt（注入记忆）
    system_prompt = ROUTER_SYSTEM_PROMPT
    if relevant_memories:
        print(f"[Router] 激活记忆:\n{relevant_memories}")
        system_prompt += f"""

【关于该用户的已知信息】:
{relevant_memories}
(请在决策时参考这些信息，判断用户偏好简单还是复杂交互)"""

    parser = PydanticOutputParser(pydantic_object=RoutingDecision)
    try:
        # 关键：动态 SystemPrompt（含记忆）+ 动态 Messages
        from agents.graph import get_router_llm_lazy
        response = await get_router_llm_lazy().ainvoke(
            [
                SystemMessage(content=system_prompt),
                *messages  # 用户的输入在这里
            ],
            config={"tags": ["router"]}
        )
        decision = parser.parse(response.content)
        print(f"[Router] 决策结果: {decision.decision_type}")
        return {"router_decision": decision.decision_type}
    except Exception as e:
        print(f"[ROUTER ERROR] {e}")
        return {"router_decision": "complex"}


async def direct_reply_node(state: AgentState) -> Dict[str, Any]:
    """
    [直连节点] 负责 Simple 模式下的流式回复
    
    直接调用 LLM 生成回复，不经过复杂的多专家流程
    🔥 新增：集成长期记忆，提供个性化回复
    """
    print(f"[DIRECT_REPLY] 节点开始执行")
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if hasattr(last_message, 'content') else str(last_message)

    # 🔥 从 state 获取 user_id
    user_id = state.get("user_id", "default_user")

    # 1. 🔥 检索长期记忆（异步）
    try:
        relevant_memories = await memory_manager.search_relevant_memories(user_id, user_query, limit=5)
    except Exception as e:
        print(f"[DirectReply] 记忆检索失败: {e}")
        relevant_memories = ""

    # 2. 🔥 构建 System Prompt（注入记忆和时间）
    system_prompt = DEFAULT_ASSISTANT_PROMPT
    if relevant_memories:
        print(f"[DirectReply] 激活记忆:\n{relevant_memories}")
        system_prompt += f"""

【关于该用户的已知信息】:
{relevant_memories}
(请在回答时自然地利用这些信息，提供更个性化的回复)"""

    # 🔥 核心修改：注入当前时间
    system_prompt = _inject_current_time(system_prompt)
    print(f"[DirectReply] 已注入当前时间到 System Prompt")

    # 使用流式配置，添加 metadata 便于追踪
    config = {"tags": ["direct_reply"], "metadata": {"node_type": "direct_reply"}}
    
    # Simple 模式使用 MiniMax（响应最快）
    from agents.graph import get_simple_llm_lazy
    response = await get_simple_llm_lazy().ainvoke(
        [
            SystemMessage(content=system_prompt),
            *messages  # 用户的历史消息上下文
        ],
        config=config
    )

    print(f"[DIRECT_REPLY] 节点完成，回复长度: {len(response.content)}")

    # 直接返回 response 对象（保留完整元数据），并添加 final_response 字段
    return {
        "messages": [response],
        "final_response": response.content
    }
