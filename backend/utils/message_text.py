"""消息文本提取（多模态安全）。

图片附件会把最后一条 HumanMessage 的 content 变成 OpenAI 多部件列表
（[{"type":"text",...},{"type":"image_url",...}]，见 routers/chat._attach_images）。
所有把 content 当字符串消费的节点（router/direct_reply/commander 等）
必须经此函数取文本，禁止直接使用 .content。
"""

from typing import Any


def extract_message_text(message: Any) -> str:
    """从消息对象提取纯文本：str 原样返回；多部件列表拼接 text 部件。"""
    content = getattr(message, "content", message)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                texts.append(str(part.get("text", "")))
        return "\n".join(texts)
    return str(content)
