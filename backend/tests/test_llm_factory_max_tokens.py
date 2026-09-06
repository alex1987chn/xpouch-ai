"""llm_factory max_tokens 配置回归测试。

背景：LLM 输出曾因未显式设置 max_tokens 被 OpenAI 兼容 API 的较小默认值
（4k~8k）静默截断，长 HTML artifact 只生成了 <head>，预览整页空白。
"""

import pytest  # noqa: E402

from utils import llm_factory  # noqa: E402


@pytest.fixture
def fake_provider(monkeypatch):
    """伪造一个已配置的 provider，返回可注入的 config 字典。"""
    config: dict = {
        "name": "Fake",
        "base_url": "https://example.invalid/v1",
        "enabled": True,
        "default_model": "fake-model",
    }

    def _install(**overrides):
        config.update(overrides)
        monkeypatch.setattr(llm_factory, "get_provider_config", lambda p: config)
        monkeypatch.setattr(llm_factory, "get_provider_api_key", lambda p: "sk-test")
        return config

    return _install


def _build(llm_factory_module, provider="fake", **kwargs):
    return llm_factory_module._build_llm_instance(
        provider=provider, model=None, streaming=False, temperature=0.3, **kwargs
    )


def test_max_tokens_from_provider_config(fake_provider):
    fake_provider(max_tokens=32768)
    llm = _build(llm_factory)
    assert llm.max_tokens == 32768


def test_max_tokens_unset_stays_none(fake_provider):
    fake_provider()
    llm = _build(llm_factory)
    assert not llm.max_tokens


def test_request_level_max_tokens_overrides_provider(fake_provider):
    fake_provider(max_tokens=32768)
    llm = _build(llm_factory, max_tokens=1024)
    assert llm.max_tokens == 1024
