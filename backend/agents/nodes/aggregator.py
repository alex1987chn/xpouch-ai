"""
Aggregator 节点 - 结果聚合器

整合多个专家的输出结果，生成自然语言的最终回复
"""
from typing import Dict, Any
from uuid import uuid4
from langchain_core.messages import SystemMessage, HumanMessage

from agents.nodes.state import AgentState
from utils.llm_factory import get_aggregator_llm
from utils.event_generator import event_message_delta, sse_event_to_string


async def aggregator_node(state: AgentState) -> Dict[str, Any]:
    """
    聚合器节点
    v3.1 更新：调用 LLM 生成自然语言总结，支持流式输出
    
    注意：此节点目前从 graph.py 导入实际实现，
    未来可完全迁移到此处
    """
    # 临时方案：从 graph.py 导入实际实现，避免循环依赖
    from agents.graph import aggregator_node as _aggregator_impl
    return await _aggregator_impl(state)


def _build_aggregator_prompt(expert_results: list, strategy: str) -> str:
    """
    构建 Aggregator 的 Prompt
    
    将多个专家的结果整合成一份连贯的报告
    """
    prompt_parts = [f"执行策略: {strategy}\n\n"]
    prompt_parts.append("=== 专家执行结果 ===\n\n")
    
    for idx, result in enumerate(expert_results, 1):
        expert_type = result.get("expert_type", "未知专家")
        description = result.get("description", "无描述")
        output = result.get("output", "")
        
        prompt_parts.append(f"【专家 {idx}】{expert_type}")
        prompt_parts.append(f"任务: {description}")
        prompt_parts.append(f"结果:\n{output}")
        prompt_parts.append("-" * 40 + "\n")
    
    prompt_parts.append("\n=== 整合要求 ===\n")
    prompt_parts.append("1. 不要简单罗列专家结果，要用自然流畅的语言进行总结")
    prompt_parts.append("2. 保持逻辑连贯性，像一份完整的报告")
    prompt_parts.append("3. 突出关键发现和结论")
    prompt_parts.append("4. 使用 Markdown 格式增强可读性")
    
    return "\n".join(prompt_parts)


def _build_markdown_response(expert_results: list, strategy: str) -> str:
    """
    构建 Markdown 格式的简单回复（兜底方案）
    """
    lines = [f"### 执行策略\n{strategy}\n"]
    lines.append("### 专家执行结果\n")
    
    for result in expert_results:
        expert_type = result.get("expert_type", "未知")
        output = result.get("output", "")
        lines.append(f"**{expert_type}**:")
        lines.append(f"> {output}\n")
    
    return "\n".join(lines)
