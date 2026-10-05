"""专家节点的消息归一化与输入格式化纯函数（批次 4 拆出，2026-09-27）。

generic.py 的 worker 只做编排；内容规范化（多模态 content 归一、历史消息
裁剪）、输入格式化、产物类型探测是**无状态纯函数**，拆出便于独立复用与测试。
"""

from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage

from tools.memory import MEMORY_TOOL_NAMES
from utils.logger import logger


def _branch_used_memory_tools(branch_messages: list) -> bool:
    """本分支是否调用过记忆管理工具（检索/删除）。

    用过 = 输出是操作报告（"已删除 N 条：…"）而非记忆素材，逐行入库必须
    跳过——否则删除报告自己会被存成记忆（历史"已为您删除…"回声即此形态，
    见 docs/BACKLOG.md 记忆系统条目）。
    """
    for message in branch_messages:
        for call in getattr(message, "tool_calls", None) or []:
            if isinstance(call, dict) and call.get("name") in MEMORY_TOOL_NAMES:
                return True
    return False


def normalize_message_content(content: str | list | Any) -> str:
    """
    将消息内容规范化为字符串格式。

    某些模型（如 DeepSeek）要求 message content 必须是字符串，
    但 ToolMessage 的 content 可能是 list[str | dict]，需要转换。

    Args:
        content: 原始内容，可能是 str, list, dict 等

    Returns:
        str: 规范化后的字符串内容
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # 将列表转换为 JSON 字符串
        return json.dumps(content, ensure_ascii=False)
    if isinstance(content, dict):
        return json.dumps(content, ensure_ascii=False)
    # 其他类型转为字符串
    return str(content)


def normalize_messages_for_llm(
    messages: list[BaseMessage], content_mode: str = "auto"
) -> list[BaseMessage]:
    """
    规范化消息列表，根据模型要求处理 content 格式。

    不同模型对 message content 的要求不同：
    - string 模式：content 必须是字符串（DeepSeek, MiniMax, Moonshot 等国产模型）
    - auto 模式：原生支持 list[str | dict]（OpenAI, Anthropic, Gemini 等）

    Args:
        messages: 原始消息列表
        content_mode: 内容模式，"string" 或 "auto"

    Returns:
        List[BaseMessage]: 规范化后的消息列表
    """
    # auto 模式下不需要转换，直接返回原消息
    if content_mode == "auto":
        return messages

    # string 模式下需要转换 ToolMessage content
    normalized = []
    for msg in messages:
        if isinstance(msg, ToolMessage):
            # ToolMessage 的 content 可能是 list/dict，需要转换为字符串
            normalized_content = normalize_message_content(msg.content)
            if normalized_content != msg.content:
                # 创建新的 ToolMessage，保留其他字段
                normalized.append(
                    ToolMessage(
                        content=normalized_content,
                        tool_call_id=msg.tool_call_id,
                        name=msg.name,
                        additional_kwargs=msg.additional_kwargs,
                        response_metadata=msg.response_metadata,
                    )
                )
            else:
                normalized.append(msg)
        else:
            normalized.append(msg)
    return normalized


def _format_input_data(data: dict) -> str:
    """格式化输入数据为文本"""
    if not data:
        return "（无额外参数）"

    return "\n".join(f"- {key}: {value}" for key, value in data.items())


def _detect_artifact_type(content: str, expert_type: str) -> str:
    """
    检测 artifact 类型

    简化版，默认返回 "text"，但会尝试检测 HTML 和 Markdown 内容。
    """
    content_lower = content.lower().strip()

    # 1. HTML 检测
    if (
        content_lower.startswith("<!doctype html")
        or content_lower.startswith("<html")
        or ("<html" in content_lower and "</html>" in content_lower)
    ):
        return "html"

    # 检测 HTML 代码块
    html_code_block = re.search(r"```html\n([\s\S]*?)```", content, re.IGNORECASE)
    if html_code_block:
        return "html"

    # 2. Markdown 检测
    has_markdown = any(marker in content for marker in ["# ", "## ", "### ", "> ", "- ", "* "])
    has_code_block = "```" in content

    if has_markdown or has_code_block:
        return "markdown"

    # 3. 默认返回 text
    return "text"


def build_task_human_message(
    task_prompt: str,
    attachments: list[str] | None,
    model_id: str,
) -> HumanMessage:
    """构造 worker 的任务 HumanMessage，附件图片按模型 vision 能力门控附加。

    路线 A（2026-10-05）：图片留在消息里随工具循环历史贯穿（模型可随时
    「回头看图」）；每轮重发是无可状态 API 的固有成本，供应商侧 prompt
    caching 可省（Anthropic/Gemini），不做中途剥离——那会砍掉回看能力。

    非 vision 模型：剥离图片并在正文追加显式标注——模型知道图存在但未
    参与，答案能如实向用户说明限制，而不是静默丢图。
    """
    if not attachments:
        return HumanMessage(content=task_prompt)

    from providers_config import get_model_config

    config = get_model_config(model_id) or {}
    if config.get("vision"):
        parts: list[dict[str, Any]] = [{"type": "text", "text": task_prompt}]
        parts += [{"type": "image_url", "image_url": {"url": url}} for url in attachments]
        return HumanMessage(content=parts)

    logger.warning(
        "[GenericWorker] ⚠️ 模型 %s 不支持视觉输入，%d 张附件图片未参与本任务（正文已标注）",
        model_id,
        len(attachments),
    )
    return HumanMessage(
        content=(
            task_prompt
            + f"\n\n[系统提示：用户提供了 {len(attachments)} 张图片，但当前专家模型不支持"
            "视觉输入，图片未参与本任务。若任务必须依赖图片内容，请在答复中如实说明该限制。]"
        )
    )
