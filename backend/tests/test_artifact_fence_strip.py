"""strip_code_fence 与围栏标注解析的行为测试。

背景：模型常给产物起名（```html:index.html … ```），专家产物此前把整个响应
原样入库，围栏头尾被 HTML 预览当正文渲染——页面顶部出现「index.html」、
底部多一行 ```（用户实测报出）。
"""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.artifacts import parse_artifacts_from_response, strip_code_fence  # noqa: E402


class TestStripCodeFence:
    def test_strips_fence_with_filename_annotation(self):
        raw = "```html:index.html\n<!DOCTYPE html>\n<html><body>x</body></html>\n```"
        assert strip_code_fence(raw) == "<!DOCTYPE html>\n<html><body>x</body></html>"

    def test_strips_plain_fence(self):
        raw = "```html\n<p>x</p>\n```"
        assert strip_code_fence(raw) == "<p>x</p>"

    def test_leaves_content_without_fence(self):
        assert strip_code_fence("<p>x</p>") == "<p>x</p>"

    def test_leaves_content_with_prose_before_fence(self):
        # 围栏前有说明文字：整体不是「被围栏包裹」，不动（宁可保留不误伤）
        raw = "这是落地页：\n```html\n<p>x</p>\n```"
        assert strip_code_fence(raw) == raw

    def test_leaves_unclosed_fence(self):
        raw = "```html:index.html\n<!DOCTYPE html>"
        assert strip_code_fence(raw) == raw

    def test_inner_code_blocks_survive(self):
        # 只剥最外层；正文内部的代码块保持原样
        raw = "```html\n<div>\n<script>\nconst a = 1;\n</script>\n</div>\n```\n尾随说明"
        # 尾部不是独立 ``` 行收尾（后面还有说明）→ 原样返回
        assert strip_code_fence(raw) == raw

        wrapped = "```html\n<div>\n<script>1;</script>\n</div>\n```"
        assert strip_code_fence(wrapped) == "<div>\n<script>1;</script>\n</div>"

    def test_non_string_passthrough(self):
        assert strip_code_fence(None) is None  # type: ignore[arg-type]


class TestParseArtifactsFenceAnnotation:
    def test_html_block_with_filename_annotation(self):
        response = "```html:index.html\n<h1>x</h1>\n```"
        artifacts = parse_artifacts_from_response(response)
        assert len(artifacts) == 1
        assert artifacts[0]["type"] == "html"
        # 文件名成为标题，内容不再带围栏
        assert artifacts[0]["title"] == "index.html"
        assert artifacts[0]["content"] == "<h1>x</h1>"

    def test_html_block_with_space_filename(self):
        response = "```html page.html\n<h1>x</h1>\n```"
        artifacts = parse_artifacts_from_response(response)
        assert artifacts[0]["title"] == "page.html"
        assert artifacts[0]["content"] == "<h1>x</h1>"

    def test_plain_block_keeps_default_title(self):
        response = "```html\n<h1>x</h1>\n```"
        artifacts = parse_artifacts_from_response(response)
        assert artifacts[0]["title"] == "HTML文档"
