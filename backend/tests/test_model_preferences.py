"""用户模型偏好与 thinking 归一化测试。

覆盖：
- GET /api/models 的数据源 get_available_models()（过滤 disabled provider 与 hidden 别名）
- get_llm_by_model 的 thinking 三态归一化（能力声明 × 用户偏好矩阵）
- _load_user_preferences 的默认值合并与脏数据防御
"""

import pytest

from models import UserSettings
from providers_config import get_available_models
from routers.system import _load_user_preferences
from utils.llm_factory import get_llm_by_model

# ============================================================================
# 可用模型列表
# ============================================================================


def test_available_models_excludes_hidden_aliases_and_disabled_providers():
    """隐藏的兼容别名与已停用 provider 的模型不应出现在可选列表中"""
    models = get_available_models()
    ids = [m["id"] for m in models]

    # 当前启用的 provider（deepseek/moonshot，conftest 已注入测试 Key）
    assert "deepseek-v4-flash" in ids
    assert "kimi-k2.6" in ids
    assert "kimi-k3" in ids

    # hidden 兼容别名不出现（kimi-k2.5 该 Key 无权限，已降级为指向 K2.6 的隐藏别名）
    assert "deepseek-chat" not in ids
    assert "deepseek-reasoner" not in ids
    assert "kimi-k2.5" not in ids
    # 已停用 provider 的模型不出现（minimax/openai 均为 enabled: false）
    assert not any(m["provider"] in ("minimax", "openai") for m in models)


def test_available_models_fields_and_capability_flags():
    """列表条目字段完整，且只有声明 thinking_toggle 的模型为 True"""
    models = {m["id"]: m for m in get_available_models()}

    deepseek = models["deepseek-v4-flash"]
    assert deepseek["thinking_toggle"] is True
    assert deepseek["provider_name"] == "DeepSeek"
    assert deepseek["context_window"] > 0

    kimi26 = models["kimi-k2.6"]
    assert kimi26["thinking_toggle"] is True  # thinking.type 参数实测有效

    # 未声明 thinking_toggle 的模型为 False（kimi-k3 未验证开关参数，不声明）
    assert models["kimi-k3"]["thinking_toggle"] is False


# ============================================================================
# thinking 归一化矩阵
# ============================================================================


def test_thinking_override_on_capable_model():
    llm_on = get_llm_by_model("deepseek-v4-flash", thinking="enabled")
    llm_off = get_llm_by_model("deepseek-v4-flash", thinking="disabled")
    assert llm_on.extra_body == {"thinking": {"type": "enabled"}}
    assert llm_off.extra_body == {"thinking": {"type": "disabled"}}


def test_thinking_auto_follows_provider_default():
    """None / auto 不下发覆盖，跟随 provider 级 yaml 默认（当前为 disabled）"""
    llm_auto = get_llm_by_model("deepseek-v4-flash", thinking=None)
    assert llm_auto.extra_body == {"thinking": {"type": "disabled"}}


def test_thinking_ignored_on_incapable_model():
    """未声明 thinking_toggle 的模型忽略 thinking 覆盖（extra_body 保持 provider 级默认）"""
    llm = get_llm_by_model("kimi-k3", thinking="enabled")
    # 覆盖被忽略：不会变成 enabled，保持 moonshot provider 默认（disabled）
    assert llm.extra_body == {"thinking": {"type": "disabled"}}


def test_get_llm_by_model_unknown_id_raises():
    with pytest.raises(ValueError, match="未知的模型 ID"):
        get_llm_by_model("no-such-model")


# ============================================================================
# 用户偏好默认值合并
# ============================================================================


class _StubSession:
    """仅支持 get() 的会话桩，避免依赖真实数据库"""

    def __init__(self, stored: UserSettings | None):
        self._stored = stored

    def get(self, model, pk):  # noqa: ANN001 - 模拟 SQLModel Session.get 签名
        if model is UserSettings and self._stored is not None and self._stored.user_id == pk:
            return self._stored
        return None


def test_load_user_preferences_defaults_when_no_row():
    prefs = _load_user_preferences(_StubSession(None), "user-1")
    assert prefs == {"simple_model": None, "simple_thinking": "auto"}


def test_load_user_preferences_merges_partial_and_sanitizes():
    stored = UserSettings(user_id="user-1", preferences={"simple_model": "deepseek-v4-flash"})
    prefs = _load_user_preferences(_StubSession(stored), "user-1")
    assert prefs == {"simple_model": "deepseek-v4-flash", "simple_thinking": "auto"}

    # 历史脏数据：非法 thinking 值回落默认
    dirty = UserSettings(user_id="user-2", preferences={"simple_thinking": "banana"})
    prefs2 = _load_user_preferences(_StubSession(dirty), "user-2")
    assert prefs2["simple_thinking"] == "auto"
