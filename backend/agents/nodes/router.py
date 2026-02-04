"""
Router 节点 - 意图识别

负责将用户输入分类为 simple 或 complex 模式
"""
from typing import Dict, Any, Literal
from langchain_core.messages import SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

from agents.nodes.state import AgentState
from constants import ROUTER_SYSTEM_PROMPT, DEFAULT_ASSISTANT_PROMPT


class RoutingDecision(BaseModel):
    """v2.7 网关决策结构（Router只负责分类）"""
    decision_type: Literal["simple", "complex"] = Field(description="决策类型")


async def router_node(state: AgentState) -> Dict[str, Any]:
    """
    [网关] 只负责分类，不负责回答
    
    根据用户输入判断应该使用 simple 模式（直接回复）
    还是 complex 模式（多专家协作）
    """
    messages = state["messages"]

    # 断点恢复检查
    if state.get("task_list") and len(state.get("task_list", [])) > 0:
        return {"router_decision": "complex"}

    parser = PydanticOutputParser(pydantic_object=RoutingDecision)
    try:
        # 关键：静态 SystemPrompt + 动态 Messages
        from agents.graph import get_router_llm_lazy
        response = await get_router_llm_lazy().ainvoke(
            [
                SystemMessage(content=ROUTER_SYSTEM_PROMPT),
                *messages  # 用户的输入在这里
            ],
            config={"tags": ["router"]}
        )
        decision = parser.parse(response.content)
        return {"router_decision": decision.decision_type}
    except Exception as e:
        print(f"[ROUTER ERROR] {e}")
        return {"router_decision": "complex"}


async def direct_reply_node(state: AgentState) -> Dict[str, Any]:
    """
    [直连节点] 负责 Simple 模式下的流式回复
    
    直接调用 LLM 生成回复，不经过复杂的多专家流程
    """
    print(f"[DIRECT_REPLY] 节点开始执行")
    messages = state["messages"]

    # 使用流式配置，添加 metadata 便于追踪
    config = {"tags": ["direct_reply"], "metadata": {"node_type": "direct_reply"}}
    
    # Simple 模式使用 MiniMax（响应最快）
    from agents.graph import get_simple_llm_lazy
    response = await get_simple_llm_lazy().ainvoke(
        [
            SystemMessage(content=DEFAULT_ASSISTANT_PROMPT),
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
