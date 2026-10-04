"""
Artifacts 解析工具

用于从LLM响应中提取代码块、HTML等内容，生成Artifacts。
"""


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
