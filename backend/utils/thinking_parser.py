"""
思考过程解析工具

解析模型返回的 <thought> 或 <think> 标签，提取思考过程内容
类似 DeepSeek Chat 和 Kimi Chat 的展开/收起功能
"""

import re


def parse_thinking(content: str) -> tuple[str, dict | None]:
    """
    从消息内容中解析 <thought> 或 <think> 标签

    Args:
        content: 原始消息内容

    Returns:
        Tuple[清理后的内容, thinking数据]
        - 清理后的内容：移除 thought 标签后的消息
        - thinking数据：如果找到 thought 标签，返回 thinking 结构，否则返回 None

    Example:
        >>> content = "<thought>让我分析一下...</thought>\n这是答案"
        >>> clean, thinking = parse_thinking(content)
        >>> clean  # "这是答案"
        >>> thinking  # {'text': '让我分析一下...', 'steps': [...]}
    """
    if not content:
        return content, None

    # 匹配 <thought>...</thought> 或 <think>...</think>（支持多行）
    # 使用非贪婪匹配，支持嵌套（虽然实际很少用）
    thought_pattern = r"<(thought|think)>(.*?)</\1>"
    matches = list(re.finditer(thought_pattern, content, re.DOTALL | re.IGNORECASE))

    if not matches:
        return content, None

    # 提取所有 thought 内容
    thought_texts = []
    for match in matches:
        thought_text = match.group(2).strip()
        thought_texts.append(thought_text)

    # 合并所有 thought 内容
    combined_thought = "\n\n".join(thought_texts)

    # 移除 thought 标签，保留其他内容
    clean_content = re.sub(thought_pattern, "", content, flags=re.DOTALL | re.IGNORECASE).strip()

    # 移除可能的前导空行
    clean_content = re.sub(r"^\s+", "", clean_content, flags=re.MULTILINE)

    # 构建 thinking 数据结构
    # 兼容前端 ThinkingSection 组件的格式
    thinking_data = {
        "text": combined_thought,  # 原始文本（用于显示）
        "steps": _parse_thinking_steps(combined_thought),  # 结构化步骤（可选）
    }

    return clean_content, thinking_data


def build_thinking_data(text: str) -> dict | None:
    """
    把纯思考文本（如 DeepSeek 的 reasoning_content 累积结果）构建为前端 thinking 数据结构

    与 parse_thinking 的区别：输入是已提取好的思考文本，无需标签解析。
    """
    text = (text or "").strip()
    if not text:
        return None
    return {
        "text": text,
        "steps": _parse_thinking_steps(text),
    }


def _parse_thinking_steps(thought_text: str) -> list:
    """
    将思考文本解析为结构化步骤（可选）

    Args:
        thought_text: 思考文本

    Returns:
        步骤列表
    """
    steps = []

    # 尝试按常见分隔符拆分
    # 1. 数字编号: 1. 2. 3.
    numbered_steps = re.split(r"\n(?=\d+\.|\d+、)", thought_text)
    if len(numbered_steps) > 1:
        for i, step in enumerate(numbered_steps, 1):
            step = step.strip()
            if step:
                steps.append(
                    {
                        "id": f"step_{i}",
                        "expertName": "思考",  # 通用标识
                        "content": step,
                        "status": "completed",
                    }
                )
        return steps

    # 2. 项目符号: - 或 *
    bullet_steps = re.split(r"\n(?=\s*[-*]\s)", thought_text)
    if len(bullet_steps) > 1:
        for i, step in enumerate(bullet_steps, 1):
            step = step.strip()
            if step:
                steps.append(
                    {
                        "id": f"step_{i}",
                        "expertName": "思考",
                        "content": step,
                        "status": "completed",
                    }
                )
        return steps

    # 3. 无法结构化，作为单个步骤
    if thought_text:
        steps.append(
            {"id": "step_1", "expertName": "思考", "content": thought_text, "status": "completed"}
        )

    return steps
