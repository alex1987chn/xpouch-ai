"""产物标题提取：artifact.title 与专家消息 summary 的**单一提取规则**。

两处本该是同一个东西（产出标题）却曾各自生成——title 有清洗规则、
summary 是首行原文，消息卡横条显示 summary 时会把模型过渡句/长句
整段糊上去（用户实报"显得很乱"）。收敛在此，画廊卡片与消息横条
从此同值。
"""

from __future__ import annotations


def artifact_title_from_output(content: str, fallback: str, max_len: int = 80) -> str:
    """产物标题的提取规则（title 单一真相源在落库处，画廊/产物卡/预览/
    下载文件名全部从这里读，不在展示层重复推导）：

    1. 优先第一个 markdown 标题行（`#`/`##`…）——报告的正式标题；
    2. 无标题行时，首非空行**仅当短（≤40 字符）且不含句读**才采用
       （形如短语/文件名）；模型过渡句（"I have sufficient information.
       Let me compile…"）特征就是完整长句，必须兜底；
    3. 兜底「{专家}结果」。
    """
    first_line = ""
    for line in (content or "").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            cleaned = stripped.lstrip("#").strip()
            if cleaned:
                return cleaned[:max_len]
        if not first_line:
            first_line = stripped
    if first_line:
        candidate = first_line.strip("*").strip()
        if (
            candidate
            and len(candidate) <= 40
            and not any(ch in candidate for ch in "。．.！!？?；;，,")
        ):
            return candidate[:max_len]
    return fallback
