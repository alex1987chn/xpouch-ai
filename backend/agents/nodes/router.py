"""
Router 节点 - 意图识别

负责将用户输入分类为 simple 或 complex 模式
集成长期记忆检索，提供个性化路由决策
v3.5 更新：使用数据库配置 + 占位符动态填充
v3.6 更新：使用 prompt_utils.inject_current_time 替代内联实现
"""
from datetime import datetime
from typing import Any, Literal

from langchain_core.messages import SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from agents.services.expert_manager import get_expert_config_cached
from agents.state import AgentState
from constants import DEFAULT_ASSISTANT_PROMPT, ROUTER_SYSTEM_PROMPT
from services.memory_manager import memory_manager  # 🔥 导入记忆管理器
from utils.event_generator import event_router_decision, event_router_start, sse_event_to_string
from utils.logger import logger
from utils.prompt_utils import inject_current_time  # v3.6: 提取到工具函数


class RoutingDecision(BaseModel):
    """v2.7 网关决策结构（Router只负责分类）"""
    decision_type: Literal["simple", "complex"] = Field(description="决策类型")


async def router_node(state: AgentState, config: RunnableConfig = None) -> dict[str, Any]:
    """
    [网关] 只负责分类，不负责回答

    根据用户输入判断应该使用 simple 模式（直接回复）
    还是 complex 模式（多专家协作）

    P1 优化: 统一 Node 签名，添加 config 参数

    🔥 新增：检索长期记忆，提供个性化决策
    🔥 修复：每次用户新输入都重新判断，不受历史 task_list 影响
    🔥 Phase 3: 发送 router.start 和 router.decision SSE 事件
    """
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if hasattr(last_message, 'content') else str(last_message)

    # v3.1 修复：移除断点恢复检查，每次用户新输入都重新判断
    # 之前的逻辑会导致 Complex 模式结束后，新消息仍被判定为 Complex
    # 如果需要断点恢复，应该由前端显式传递恢复信号，而不是自动判断

    # 🔥 从 state 获取 user_id（如果存在），否则使用默认值
    # 后续可以从请求 header 或上下文传递 user_id
    user_id = state.get("user_id", "default_user")

    logger.info(f"--- [Router] 正在思考: {user_query[:100]}... ---")

    # 🔥 Phase 3: 初始化事件队列，发送 router.start 事件（不可变更新）
    base_event_queue = state.get("event_queue", [])
    start_event = event_router_start(query=user_query[:200])  # 限制长度
    event_queue = [
        *base_event_queue,
        {"type": "sse", "event": sse_event_to_string(start_event)},
    ]
    logger.info("[Router] 已发送 router.start 事件")

    # 1. 🔥 检索长期记忆（异步）
    try:
        relevant_memories = await memory_manager.search_relevant_memories(user_id, user_query, limit=3)
    except Exception as e:
        logger.warning(f"[Router] 记忆检索失败: {e}")
        relevant_memories = ""

    # 2. 🔥 v3.5: 加载 System Prompt（DB -> Cache -> Constants 兜底）
    system_prompt = _load_router_system_prompt()

    # 3. 🔥 v3.5: 填充占位符
    system_prompt = _fill_router_placeholders(
        system_prompt=system_prompt,
        user_query=user_query,
        relevant_memories=relevant_memories
    )
    logger.info("[Router] System Prompt 已加载并填充占位符")

    parser = PydanticOutputParser(pydantic_object=RoutingDecision)
    try:
        # 🔥 v3.7: 智能模式选择 - 先尝试 with_structured_output，不支持则降级
        from agents.graph import get_router_llm_lazy
        llm = get_router_llm_lazy()

        # 尝试使用原生结构化输出（OpenAI, Kimi 等支持）
        try:
            llm_structured = llm.with_structured_output(RoutingDecision)
            decision = await llm_structured.ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    *messages
                ],
                config={"tags": ["router"], "metadata": {"node_type": "router"}}
            )
            # 健壮性处理：支持 Pydantic 对象或字典返回
            if isinstance(decision, dict):
                decision_type = decision.get("decision_type", "complex")
            else:
                decision_type = decision.decision_type
            logger.info(f"[Router] 使用结构化输出，决策结果: {decision_type}")
        except Exception as structured_error:
            # 模型不支持 structured_output（如 DeepSeek），降级到 PydanticOutputParser
            if "response_format" in str(structured_error).lower() or "400" in str(structured_error):
                logger.warning("[Router] 模型不支持结构化输出，降级到 PydanticOutputParser")
                response = await llm.ainvoke(
                    [
                        SystemMessage(content=system_prompt),
                        *messages
                    ],
                    config={"tags": ["router"], "metadata": {"node_type": "router"}}
                )
                decision = parser.parse(response.content)
                decision_type = decision.decision_type
                logger.info(f"[Router] 使用 PydanticOutputParser，决策结果: {decision_type}")
            else:
                # 其他错误，继续抛出
                raise

        # 🔥 Phase 3: 发送 router.decision 事件
        decision_event = event_router_decision(
            decision=decision_type,
            reason="Based on query complexity analysis"
        )
        full_event_queue = [
            *event_queue,
            {"type": "sse", "event": sse_event_to_string(decision_event)},
        ]
        logger.info(f"[Router] 已发送 router.decision 事件: {decision_type}")

        return {
            "router_decision": decision_type,
            "event_queue": full_event_queue  # 返回事件队列
        }
    except Exception as e:
        logger.error(f"[ROUTER ERROR] {e}")

        # 🔥 Phase 3: 错误时也发送 decision 事件（fallback 到 complex）
        decision_event = event_router_decision(
            decision="complex",
            reason=f"Router error, fallback to complex mode: {str(e)}"
        )
        full_event_queue = [
            *event_queue,
            {"type": "sse", "event": sse_event_to_string(decision_event)},
        ]
        logger.info("[Router] 错误，已发送 fallback router.decision 事件")

        return {
            "router_decision": "complex",
            "event_queue": full_event_queue
        }


def _load_router_system_prompt() -> str:
    """
    v3.5: 三层兜底加载 Router System Prompt

    L1: SystemExpert 数据库表
    L2: 内存缓存
    L3: constants.ROUTER_SYSTEM_PROMPT (静态兜底)
    """
    # L1/L2: 尝试从数据库/缓存加载
    try:
        config = get_expert_config_cached("router")
        if config and config.get("system_prompt"):
            logger.info("[Router] 从数据库/缓存加载 System Prompt")
            return config["system_prompt"]
    except Exception as e:
        logger.warning(f"[Router] 从数据库加载失败: {e}")

    # L3: 兜底到静态常量
    logger.info("[Router] 使用静态常量 System Prompt (L3兜底)")
    return ROUTER_SYSTEM_PROMPT


def _fill_router_placeholders(
    system_prompt: str,
    user_query: str,
    relevant_memories: str
) -> str:
    """
    v3.5: 填充 Router System Prompt 中的占位符

    占位符:
    - {user_query}: 用户查询
    - {current_time}: 当前时间
    - {relevant_memories}: 相关记忆
    """
    # 准备时间信息
    now = datetime.now()
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    weekday_str = weekdays[now.weekday()]
    time_str = now.strftime(f"%Y年%m月%d日 %H:%M:%S {weekday_str}")

    # 构建占位符映射
    placeholder_map = {
        "user_query": user_query,
        "current_time": time_str,
        "relevant_memories": relevant_memories if relevant_memories else "（暂无记忆）"
    }

    # 替换所有支持的占位符
    for placeholder, value in placeholder_map.items():
        placeholder_pattern = f"{{{placeholder}}}"
        if placeholder_pattern in system_prompt:
            system_prompt = system_prompt.replace(placeholder_pattern, value)
            logger.info(f"[Router] 已注入占位符: {{{placeholder}}}")

    # 检查是否还有未填充的占位符（警告但不中断）
    import re
    remaining_placeholders = re.findall(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}', system_prompt)
    if remaining_placeholders:
        logger.warning(f"[Router] 警告: 以下占位符未填充: {remaining_placeholders}")

    return system_prompt


async def direct_reply_node(state: AgentState, config: RunnableConfig = None) -> dict[str, Any]:
    """
    [直连节点] 负责 Simple 模式下的流式回复

    直接调用 LLM 生成回复，不经过复杂的多专家流程

    P1 优化: 统一 Node 签名，添加 config 参数

    🔥 新增：集成长期记忆，提供个性化回复
    """
    logger.info("[DIRECT_REPLY] 节点开始执行")
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if hasattr(last_message, 'content') else str(last_message)

    # 🔥 从 state 获取 user_id
    user_id = state.get("user_id", "default_user")

    # 1. 🔥 检索长期记忆（异步）
    try:
        relevant_memories = await memory_manager.search_relevant_memories(user_id, user_query, limit=5)
    except Exception as e:
        logger.warning(f"[DirectReply] 记忆检索失败: {e}")
        relevant_memories = ""

    # 2. 🔥 构建 System Prompt（注入记忆和时间）
    system_prompt = DEFAULT_ASSISTANT_PROMPT
    if relevant_memories:
        logger.info(f"[DirectReply] 激活记忆:\n{relevant_memories}")
        system_prompt += f"""

【关于该用户的已知信息】:
{relevant_memories}
(请在回答时自然地利用这些信息，提供更个性化的回复)"""

    # 🔥 核心修改：注入当前时间
    system_prompt = inject_current_time(system_prompt)
    logger.info("[DirectReply] 已注入当前时间到 System Prompt")

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

    logger.info(f"[DIRECT_REPLY] 节点完成，回复长度: {len(response.content)}")

    # 直接返回 response 对象（保留完整元数据），并添加 final_response 字段
    return {
        "messages": [response],
        "final_response": response.content
    }
