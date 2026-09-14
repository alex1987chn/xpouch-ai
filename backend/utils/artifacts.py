"""
Artifacts 解析工具

用于从LLM响应中提取代码块、HTML等内容，生成Artifacts。
"""

import re


def strip_code_fence(content: str) -> str:
    """剥掉「包裹整个内容的一层代码围栏」，正文内部的代码块不动。

    模型常给产物起名：```html:index.html … ```（也见 ```html index.html 形态）。
    专家产物此前把整个响应原样存入 artifact，围栏头尾被 HTML 预览当正文渲染——
    表现为页面顶部出现「index.html」字样、底部多一行 ```。

    只在内容以围栏开头、且以独立的 ``` 行收尾时剥；其余情况（围栏前有说明文字、
    没有闭合围栏等）原样返回，宁可保留也不误伤。
    """
    if not isinstance(content, str):
        return content
    text = content.strip()
    if not text.startswith("```"):
        return content
    head_end = text.find("\n")
    if head_end == -1:
        return content
    body = text[head_end + 1 :]
    if not body.endswith("\n```"):
        return content
    return body[:-4].rstrip()


def parse_artifacts_from_response(response: str) -> list[dict]:
    """
    从LLM响应中解析Artifacts

    支持的格式：
    - 代码块：```langage code```
    - HTML代码块：```html html```
    - Markdown标题：### Title

    Args:
        response: LLM响应文本

    Returns:
        Artifacts列表，每个artifact包含：
        {
            "type": "code" | "html" | "text" | "diagram",
            "title": str,
            "content": str,
            "language": str  # 仅type=code时
        }
    """
    artifacts = []

    # 1. 解析代码块。围栏头部除语言外还可能带文件名标注——模型常用
    #    ```html:index.html 或 ```html index.html 给产物命名。旧正则只认
    #    「```lang\n」，遇到标注整个块不匹配，围栏会原样漏进产物内容。
    code_pattern = r"```([^\n]*)\n(.*?)\n```"
    for match in re.finditer(code_pattern, response, re.DOTALL):
        header = match.group(1).strip()
        # 语言 = 头部第一个 token；余下部分若存在，视为模型给产物起的文件名
        parts = re.split(r"[:|\s]+", header, maxsplit=1)
        language = parts[0] if parts and parts[0] else "text"
        filename = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
        content = match.group(2).strip()

        # 确定artifact类型
        if language == "html":
            artifact_type = "html"
            title = filename or "HTML文档"
        elif language in ["python", "javascript", "typescript", "java", "go", "rust", "c", "cpp"]:
            artifact_type = "code"
            title = filename or f"{language.capitalize()}代码"
        elif language == "mermaid":
            artifact_type = "diagram"
            title = "流程图"
        else:
            artifact_type = "code"
            title = filename or f"{language.capitalize()}代码"

        artifacts.append(
            {"type": artifact_type, "title": title, "content": content, "language": language}
        )

    # 2. 解析Markdown标题（### Title）
    if len(artifacts) == 0:  # 如果没有代码块，才处理标题
        heading_pattern = r"###\s+(.+?)(?:\n|$)"
        for match in re.finditer(heading_pattern, response):
            title = match.group(1).strip()
            # 提取标题后的内容
            start_pos = match.end()
            end_pos = start_pos
            next_heading = re.search(r"\n###\s+", response[start_pos:])
            if next_heading:
                end_pos = start_pos + next_heading.start()
            content = response[start_pos:end_pos].strip()

            if content:
                artifacts.append({"type": "text", "title": title, "content": content})

    # 3. 如果整个响应就是长代码，生成单个artifact
    if len(artifacts) == 0 and len(response) > 100:
        # 检测是否主要是代码
        code_ratio = sum(1 for c in response if c in "{}()[];=") / len(response)
        if code_ratio > 0.1:
            artifacts.append(
                {"type": "code", "title": "代码", "content": response, "language": "text"}
            )

    return artifacts


def generate_artifact_event(artifact: dict) -> str:
    """
    生成Artifact的SSE事件

    Args:
        artifact: artifact字典

    Returns:
        SSE格式的字符串
    """
    import json

    return f"data: {json.dumps({'type': 'artifact', 'artifact': artifact})}\n\n"
