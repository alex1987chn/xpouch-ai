"""
模型兜底机制

确保所有专家使用有效的模型，当配置的模型不可用时自动切换为环境变量中配置的模型。
"""
import os
from typing import Optional

# 从环境变量读取默认模型 - 每次调用时重新读取，避免模块导入时的值被缓存
def get_default_model() -> str:
    """获取默认模型（每次都从环境变量读取）"""
    return os.getenv("MODEL_NAME", "deepseek-chat")

# 为兼容性保留
DEFAULT_MODEL = get_default_model()

# 需要被替换的无效模型列表（OpenAI 模型在第三方 API 上可能不可用）
OPENAI_MODELS = [
    "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo",
    "gpt-4-vision-preview", "gpt-4-turbo-preview"
]


def get_effective_model(configured_model: Optional[str]) -> str:
    """
    获取有效的模型名称

    逻辑：
    1. 如果未配置模型，使用环境变量 MODEL_NAME 或默认值
    2. 如果配置的是 OpenAI 模型（gpt-开头），自动切换为默认模型
    3. 支持通过环境变量 FORCE_MODEL_FALLBACK=true 强制使用兜底模型

    Args:
        configured_model: 数据库中配置的模型名称

    Returns:
        str: 实际应该使用的模型名称
    """
    # 每次都重新读取默认模型
    default_model = get_default_model()

    # 强制兜底模式
    if os.getenv("FORCE_MODEL_FALLBACK", "").lower() == "true":
        print(f"[ModelFallback] 强制兜底模式，使用 '{default_model}'")
        return default_model

    # 未配置时使用默认
    if not configured_model:
        return default_model

    # 检查是否需要模型兜底
    if _should_fallback(configured_model):
        print(f"[ModelFallback] 模型 '{configured_model}' 需要兜底，切换为 '{default_model}'")
        return default_model

    return configured_model


def _should_fallback(model: str) -> bool:
    """
    判断是否需要模型兜底

    判断逻辑：
    1. 如果模型是 OpenAI 模型（gpt-开头），默认需要兜底（除非明确允许）
    2. 如果环境变量 ALLOW_OPENAI_MODELS=true，则允许使用 OpenAI 模型

    Args:
        model: 模型名称

    Returns:
        bool: 是否需要兜底
    """
    # 如果不是 OpenAI 模型，不需要兜底
    if not any(model.startswith(om) for om in OPENAI_MODELS):
        return False

    # OpenAI 模型默认需要兜底，除非明确配置 ALLOW_OPENAI_MODELS=true
    if os.getenv("ALLOW_OPENAI_MODELS", "").lower() == "true":
        return False

    # 检查 API 配置，更宽松的判断
    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "")

    # 如果 base_url 包含 openai.com，且明确使用 OpenAI，则不需要兜底
    if "openai.com" in base_url and os.getenv("ALLOW_OPENAI_MODELS", "").lower() == "true":
        return False

    # 默认情况下，所有 gpt- 开头的模型都需要兜底（更安全）
    print(f"[ModelFallback] 检测到 OpenAI 模型 '{model}'，触发兜底机制")
    return True


def validate_expert_config(expert_config: dict) -> dict:
    """
    验证并修正专家配置

    Args:
        expert_config: 专家配置字典

    Returns:
        dict: 修正后的配置
    """
    if not expert_config:
        return expert_config

    original_model = expert_config.get("model", "")
    effective_model = get_effective_model(original_model)

    if original_model != effective_model:
        expert_config = expert_config.copy()
        expert_config["model"] = effective_model
        print(f"[ModelFallback] 专家 '{expert_config.get('expert_key', 'unknown')}' 模型已调整: {original_model} -> {effective_model}")

    return expert_config
