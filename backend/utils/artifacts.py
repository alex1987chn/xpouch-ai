"""
Artifacts 解析工具

用于从LLM响应中提取代码块、HTML等内容，生成Artifacts。
"""
import re
from typing import List, Dict, Optional


def parse_artifacts_from_response(response: str) -> List[Dict]:
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

    # 1. 解析代码块 (```language code```)
    code_pattern = r'```(\w+)?\n(.*?)\n```'
    for match in re.finditer(code_pattern, response, re.DOTALL):
        language = match.group(1) or "text"
        content = match.group(2).strip()

        # 确定artifact类型
        if language == "html":
            artifact_type = "html"
            title = "HTML文档"
        elif language in ["python", "javascript", "typescript", "java", "go", "rust", "c", "cpp"]:
            artifact_type = "code"
            title = f"{language.capitalize()}代码"
        elif language == "mermaid":
            artifact_type = "diagram"
            title = "流程图"
        else:
            artifact_type = "code"
            title = f"{language.capitalize()}代码"

        artifacts.append({
            "type": artifact_type,
            "title": title,
            "content": content,
            "language": language
        })

    # 2. 解析Markdown标题（### Title）
    if len(artifacts) == 0:  # 如果没有代码块，才处理标题
        heading_pattern = r'###\s+(.+?)(?:\n|$)'
        for match in re.finditer(heading_pattern, response):
            title = match.group(1).strip()
            # 提取标题后的内容
            start_pos = match.end()
            end_pos = start_pos
            next_heading = re.search(r'\n###\s+', response[start_pos:])
            if next_heading:
                end_pos = start_pos + next_heading.start()
            content = response[start_pos:end_pos].strip()

            if content:
                artifacts.append({
                    "type": "text",
                    "title": title,
                    "content": content
                })

    # 3. 如果整个响应就是长代码，生成单个artifact
    if len(artifacts) == 0 and len(response) > 100:
        # 检测是否主要是代码
        code_ratio = sum(1 for c in response if c in '{}()[];=') / len(response)
        if code_ratio > 0.1:
            artifacts.append({
                "type": "code",
                "title": "代码",
                "content": response,
                "language": "text"
            })

    return artifacts


def generate_artifact_event(artifact: Dict) -> str:
    """
    生成Artifact的SSE事件

    Args:
        artifact: artifact字典

    Returns:
        SSE格式的字符串
    """
    import json
    return f"data: {json.dumps({'type': 'artifact', 'artifact': artifact})}\n\n"
