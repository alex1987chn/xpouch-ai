"""extra_data 类型兼容回归测试。

背景：生产老库漂移存在以 JSON 字符串落库的 extra_data 存量行，
_build_document_context_blocks 曾直接 .get() 导致含此类历史的会话
发送消息必现 500。
"""

import json

from services.chat.thread_service import _build_document_context_blocks


def _doc_payload():
    return {
        "documents": [{"name": "spec.pdf", "text": "列宽 24"}],
    }


def test_dict_extra_data_builds_blocks():
    out = _build_document_context_blocks(_doc_payload())
    assert "【用户附件：spec.pdf】" in out
    assert "列宽 24" in out


def test_string_extra_data_is_parsed():
    out = _build_document_context_blocks(json.dumps(_doc_payload()))
    assert "spec.pdf" in out


def test_garbage_string_returns_empty():
    assert _build_document_context_blocks("not-json{{") == ""
    assert _build_document_context_blocks(json.dumps(["not", "a", "dict"])) == ""


def test_none_and_empty_are_safe():
    assert _build_document_context_blocks(None) == ""
    assert _build_document_context_blocks({}) == ""


def test_non_document_keys_ignored():
    payload = {"thinking": [{"x": 1}], "image_count": 2}
    assert _build_document_context_blocks(payload) == ""
