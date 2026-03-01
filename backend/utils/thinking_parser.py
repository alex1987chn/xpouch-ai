"""
思考过程解析工具

解析模型返回的 <thought> 或 <think> 标签，提取思考过程内容
类似 DeepSeek Chat 和 Kimi Chat 的展开/收起功能
"""

import re
from typing import Tuple, Optional
import json
from utils.logger import logger


def parse_thinking(content: str) -> Tuple[str, Optional[dict]]:
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
    thought_pattern = r'<(thought|think)>(.*?)</\1>'
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
    clean_content = re.sub(thought_pattern, '', content, flags=re.DOTALL | re.IGNORECASE).strip()

    # 移除可能的前导空行
    clean_content = re.sub(r'^\s+', '', clean_content, flags=re.MULTILINE)

    # 构建 thinking 数据结构
    # 兼容前端 ThinkingSection 组件的格式
    thinking_data = {
        'text': combined_thought,  # 原始文本（用于显示）
        'steps': _parse_thinking_steps(combined_thought)  # 结构化步骤（可选）
    }

    return clean_content, thinking_data


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
    numbered_steps = re.split(r'\n(?=\d+\.|\d+、)', thought_text)
    if len(numbered_steps) > 1:
        for i, step in enumerate(numbered_steps, 1):
            step = step.strip()
            if step:
                steps.append({
                    'id': f'step_{i}',
                    'expertName': '思考',  # 通用标识
                    'content': step,
                    'status': 'completed'
                })
        return steps

    # 2. 项目符号: - 或 *
    bullet_steps = re.split(r'\n(?=\s*[-*]\s)', thought_text)
    if len(bullet_steps) > 1:
        for i, step in enumerate(bullet_steps, 1):
            step = step.strip()
            if step:
                steps.append({
                    'id': f'step_{i}',
                    'expertName': '思考',
                    'content': step,
                    'status': 'completed'
                })
        return steps

    # 3. 无法结构化，作为单个步骤
    if thought_text:
        steps.append({
            'id': 'step_1',
            'expertName': '思考',
            'content': thought_text,
            'status': 'completed'
        })

    return steps


def extract_thinking_for_stream(content: str) -> Tuple[bool, str, Optional[str]]:
    """
    流式处理时提取 thinking 内容

    Args:
        content: 当前累积的内容

    Returns:
        Tuple[是否在thought标签内, 当前thinking内容, 已完成的thinking内容]
    """
    # 检查是否在 <thought> 标签内
    opening_tags = re.findall(r'<(thought|think)>', content, re.IGNORECASE)
    closing_tags = re.findall(r'</(thought|think)>', content, re.IGNORECASE)

    in_thought = len(opening_tags) > len(closing_tags)

    # 提取当前正在进行的 thought
    if in_thought:
        # 找到最后一个打开的标签位置
        last_open_match = None
        for match in re.finditer(r'<(thought|think)>', content, re.IGNORECASE):
            last_open_match = match

        if last_open_match:
            current_thought = content[last_open_match.end():].strip()
            return True, current_thought, None

    # 提取已完成的 thought
    completed_thought = None
    thought_pattern = r'<(thought|think)>(.*?)</\1>'
    matches = list(re.finditer(thought_pattern, content, re.DOTALL | re.IGNORECASE))
    if matches:
        # 合并所有已完成的 thought
        completed_thought = "\n\n".join([m.group(2).strip() for m in matches])

    return False, "", completed_thought


if __name__ == "__main__":
    # 测试用例
    test_cases = [
        "<thought>我需要分析这个问题...\n首先，考虑X\n然后，考虑Y</thought>\n答案是42",
        "<think>让我想想...</think>\n这是最终答案",
        "没有 thought 标签的普通消息",
        "<thought>第一步\n第二步\n第三步</think>",
    ]

    for i, test in enumerate(test_cases, 1):
        logger.info(f"\n=== 测试用例 {i} ===")
        logger.info(f"原文:\n{test}\n")
        clean, thinking = parse_thinking(test)
        logger.info(f"清理后:\n{clean}\n")
        if thinking:
            logger.info(f"Thinking 数据:\n{json.dumps(thinking, indent=2, ensure_ascii=False)}\n")
        else:
            logger.info("未找到 thought 标签")
