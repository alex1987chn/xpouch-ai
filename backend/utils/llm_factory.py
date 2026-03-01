"""
LLM 工厂模块

统一管理和创建 LLM 实例，完全基于配置文件（providers.yaml）
消除硬编码，支持动态添加新提供商

P1 优化:
- 使用 functools.lru_cache 简化缓存
- tenacity 重试机制
"""

import os
import logging
from typing import Optional, Any
from functools import lru_cache
from langchain_openai import ChatOpenAI
from providers_config import (
    get_provider_config,
    get_provider_api_key,
    get_best_router_provider,
    is_provider_configured
)
from utils.logger import logger as custom_logger
import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)

logger = logging.getLogger(__name__)


# ============================================================================
# 模型兜底机制
# ============================================================================

def get_default_model() -> str:
    """获取默认模型"""
    return os.getenv("MODEL_NAME", "deepseek-chat")


def get_effective_model(configured_model: Optional[str]) -> str:
    """
    获取有效的模型名称（模型兜底机制）
    
    逻辑：
    1. 如果未配置模型，使用环境变量 MODEL_NAME 或默认值
    2. 如果配置的是 OpenAI 模型，自动切换为默认模型（除非 ALLOW_OPENAI_MODELS=true）
    """
    default_model = get_default_model()
    
    # 强制兜底模式
    if os.getenv("FORCE_MODEL_FALLBACK", "").lower() == "true":
        custom_logger.info(f"[ModelFallback] 强制兜底模式，使用 '{default_model}'")
        return default_model
    
    # 未配置时使用默认
    if not configured_model:
        return default_model
    
    # 解析模型别名映射
    try:
        from providers_config import get_model_config
        model_config = get_model_config(configured_model)
        if model_config and 'model' in model_config:
            resolved_model = model_config['model']
            if resolved_model != configured_model:
                custom_logger.info(f"[ModelFallback] 模型别名解析: '{configured_model}' -> '{resolved_model}'")
                configured_model = resolved_model
    except ImportError:
        pass
    
    # OpenAI 模型兜底检查
    openai_models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]
    if not any(configured_model.startswith(om) for om in openai_models):
        return configured_model
    
    # 允许 OpenAI 模型
    if os.getenv("ALLOW_OPENAI_MODELS", "").lower() == "true":
        return configured_model
    
    # 兜底到默认模型
    custom_logger.info(f"[ModelFallback] 检测到 OpenAI 模型 '{configured_model}'，切换为 '{default_model}'")
    return default_model


# ============================================================================
# LLM 实例工厂 - 使用 lru_cache 缓存
# ============================================================================

@lru_cache(maxsize=32)
def _create_llm_instance(
    provider: str,
    model: Optional[str],
    streaming: bool,
    temperature: Optional[float]
) -> ChatOpenAI:
    """
    创建 LLM 实例（内部函数，使用 lru_cache 缓存）
    
    注意：参数必须是可哈希的（str, bool, float 等），所以 model 和 temperature 用 Optional[str/float]
    """
    config = get_provider_config(provider)
    if not config:
        raise ValueError(f"未知的提供商: {provider}")
    
    if not config.get('enabled', True):
        raise ValueError(f"提供商 {provider} 已在配置中禁用")
    
    api_key = get_provider_api_key(provider)
    if not api_key:
        env_key = config.get('env_key', f'{provider.upper()}_API_KEY')
        raise ValueError(f"未配置 {provider} 的 API Key，请在 .env 文件中设置: {env_key}=your-api-key")
    
    llm_config = {
        'model': model or config.get('default_model'),
        'api_key': api_key,
        'base_url': config.get('base_url'),
        'streaming': streaming,
    }
    
    # 温度参数
    llm_config['temperature'] = temperature if temperature is not None else config.get('temperature', 0.7)
    
    # HTTP 客户端配置
    http_client = httpx.Client(
        http2=False,
        timeout=600.0,
        verify=True
    )
    llm_config['http_client'] = http_client
    
    return ChatOpenAI(**llm_config)


def get_llm_instance(
    provider: str,
    model: Optional[str] = None,
    streaming: bool = False,
    temperature: Optional[float] = None,
) -> ChatOpenAI:
    """
    统一的 LLM 工厂函数
    
    P1 优化: 使用 lru_cache 自动缓存实例
    
    Args:
        provider: 提供商标识（如 'minimax', 'deepseek'）
        model: 模型名称
        streaming: 是否启用流式输出
        temperature: 温度参数
        
    Returns:
        ChatOpenAI: 配置好的 LLM 实例
    """
    return _create_llm_instance(provider, model, streaming, temperature)


def get_llm_by_model(model_id: str, streaming: bool = False) -> ChatOpenAI:
    """通过模型 ID 获取 LLM 实例"""
    from providers_config import get_model_config
    
    model_config = get_model_config(model_id)
    if not model_config:
        raise ValueError(f"未知的模型 ID: {model_id}")
    
    return get_llm_instance(
        provider=model_config.get('provider'),
        model=model_config.get('model'),
        streaming=streaming
    )


def get_router_llm() -> ChatOpenAI:
    """获取 Router 节点专用的 LLM 实例"""
    provider = get_best_router_provider()
    
    if not provider:
        raise ValueError("没有可用的 LLM 提供商用于 Router")
    
    from providers_config import get_router_config
    router_config = get_router_config()
    
    return get_llm_instance(
        provider=provider,
        streaming=router_config.get('streaming', False),
        temperature=router_config.get('temperature', 0.1)
    )


def get_expert_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None
) -> ChatOpenAI:
    """获取 Expert 节点专用的 LLM 实例"""
    if provider:
        return get_llm_instance(provider=provider, model=model, streaming=True, temperature=temperature)
    
    if is_provider_configured('deepseek'):
        return get_llm_instance(provider='deepseek', model=model, streaming=True, temperature=temperature or 0.7)
    
    return get_llm_instance(provider=get_best_router_provider(), model=model, streaming=True, temperature=temperature)


def get_commander_llm() -> ChatOpenAI:
    """获取 Commander 节点专用的 LLM 实例"""
    if is_provider_configured('deepseek'):
        return get_llm_instance(provider='deepseek', streaming=True, temperature=0.5)
    if is_provider_configured('openai'):
        return get_llm_instance(provider='openai', streaming=True, temperature=0.5)
    return get_router_llm()


def get_aggregator_llm() -> ChatOpenAI:
    """获取 Aggregator 节点专用的 LLM 实例"""
    if is_provider_configured('deepseek'):
        return get_llm_instance(provider='deepseek', streaming=True, temperature=0.7)
    if is_provider_configured('openai'):
        return get_llm_instance(provider='openai', streaming=True, temperature=0.7)
    if is_provider_configured('minimax'):
        return get_llm_instance(provider='minimax', streaming=True, temperature=0.7)
    return get_router_llm()


# ============================================================================
# 便捷函数
# ============================================================================

def list_available_providers() -> list:
    """列出所有可用的提供商"""
    from providers_config import get_active_providers
    return list(get_active_providers().keys())


def clear_llm_cache():
    """清空 LLM 缓存"""
    _create_llm_instance.cache_clear()


def get_llm_cache_info():
    """获取缓存信息"""
    return _create_llm_instance.cache_info()


# ============================================================================
# P1 优化: 带重试的 LLM 调用函数
# ============================================================================

@retry(
    retry=retry_if_exception_type((Exception,)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True
)
async def invoke_llm_with_retry(llm: ChatOpenAI, messages: list, **kwargs) -> Any:
    """带重试机制的 LLM 调用 (非流式)"""
    return await llm.ainvoke(messages, **kwargs)


@retry(
    retry=retry_if_exception_type((Exception,)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True
)
async def stream_llm_with_retry(llm: ChatOpenAI, messages: list, **kwargs):
    """带重试机制的 LLM 调用 (流式)"""
    async for chunk in llm.astream(messages, **kwargs):
        yield chunk


if __name__ == "__main__":
    from providers_config import print_provider_status, get_all_providers
    
    print_provider_status()
    custom_logger.info(f"\n缓存信息: {get_llm_cache_info()}")
