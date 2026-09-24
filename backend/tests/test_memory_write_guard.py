"""记忆写入护栏单测。

为什么值得测：embedding 失败曾静默 return——调用方（generic 记忆分支）完全
无感，用户以为记住了实际没存。现在是 fail-loud 契约：_add_memory_sync 必须
抛 RuntimeError，让调用方能向用户如实上报"未记住"。这条契约一旦回退成静默，
谎报就会复发，所以钉住它。
"""

import pytest

from services import memory_manager as mm


def test_add_memory_raises_on_embedding_failure(monkeypatch):
    """embedding 为空必须抛 RuntimeError（且在触库之前），不得静默返回。"""
    monkeypatch.setattr(mm, "get_embedding", lambda text: [])
    with pytest.raises(RuntimeError, match="embedding"):
        mm.memory_manager._add_memory_sync(user_id="u1", content="用户喜欢深色主题")


def test_add_memory_ignores_blank_content(monkeypatch):
    """空白内容静默忽略（不是错误，也不触 embedding/DB）。"""
    called = []

    def _fake_embed(text):
        called.append(text)
        return [0.1, 0.2]

    monkeypatch.setattr(mm, "get_embedding", _fake_embed)
    mm.memory_manager._add_memory_sync(user_id="u1", content="   ")
    assert not called
