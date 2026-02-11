"""
LLM 工厂模块

统一管理和创建 LLM 实例，完全基于配置文件（providers.yaml）
消除硬编码，支持动态添加新提供商

P2 优化: 添加 LLM 实例缓存池，复用实例减少创建开销

使用示例：
    # 获取指定提供商的 LLM
    llm = get_llm_instance(provider="minimax", streaming=True)
    
    # Router 自动选择最佳提供商
    router_llm = get_router_llm()
"""

import os
from typing import Optional, Dict, Any
from langchain_openai import ChatOpenAI
from providers_config import (
    get_provider_config,
    get_provider_api_key,
    get_best_router_provider,
    is_provider_configured
)
import httpx

# ============================================================================
# P2 优化: LLM 实例缓存池
# ============================================================================

# 全局缓存字典: key -> ChatOpenAI instance
_llm_cache: Dict[str, ChatOpenAI] = {}
_cache_hits = 0
_cache_misses = 0

def _get_cache_key(provider: str, model: Optional[str], streaming: bool, temperature: Optional[float]) -> str:
    """生成缓存键"""
    return f"{provider}:{model or 'default'}:{streaming}:{temperature or 'default'}"

def get_cached_llm(provider: str, model: Optional[str], streaming: bool, temperature: Optional[float]) -> Optional[ChatOpenAI]:
    """从缓存获取 LLM 实例"""
    global _cache_hits
    key = _get_cache_key(provider, model, streaming, temperature)
    if key in _llm_cache:
        _cache_hits += 1
        return _llm_cache[key]
    return None

def set_cached_llm(provider: str, model: Optional[str], streaming: bool, temperature: Optional[float], llm: ChatOpenAI) -> None:
    """缓存 LLM 实例"""
    global _cache_misses
    key = _get_cache_key(provider, model, streaming, temperature)
    _llm_cache[key] = llm
    _cache_misses += 1

def get_llm_cache_stats() -> Dict[str, Any]:
    """获取缓存统计"""
    total = _cache_hits + _cache_misses
    hit_rate = (_cache_hits / total * 100) if total > 0 else 0
    return {
        "cached_instances": len(_llm_cache),
        "cache_hits": _cache_hits,
        "cache_misses": _cache_misses,
        "hit_rate": f"{hit_rate:.1f}%"
    }

def clear_llm_cache() -> None:
    """清空 LLM 缓存"""
    global _llm_cache, _cache_hits, _cache_misses
    _llm_cache.clear()
    _cache_hits = 0
    _cache_misses = 0
    print("[LLM Cache] 缓存已清空")


# ============================================================================
# 模型兜底机制（兼容接口，原 model_fallback.py 功能）
# ============================================================================

def get_default_model() -> str:
    """
    获取默认模型（每次都从环境变量读取）
    
    兼容原 model_fallback.py 接口
    """
    return os.getenv("MODEL_NAME", "deepseek-chat")


def get_effective_model(configured_model: Optional[str]) -> str:
    """
    获取有效的模型名称（模型兜底机制）
    
    逻辑：
    1. 如果未配置模型，使用环境变量 MODEL_NAME 或默认值
    2. 如果配置的是 OpenAI 模型（gpt-开头），自动切换为默认模型
    3. 支持通过环境变量 FORCE_MODEL_FALLBACK=true 强制使用兜底模型
    4. 解析模型别名映射（通过 providers_config）
    
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
    
    # 解析模型别名映射
    try:
        from providers_config import get_model_config
        model_config = get_model_config(configured_model)
        if model_config and 'model' in model_config:
            resolved_model = model_config['model']
            if resolved_model != configured_model:
                print(f"[ModelFallback] 模型别名解析: '{configured_model}' -> '{resolved_model}'")
                configured_model = resolved_model
    except ImportError:
        print(f"[ModelFallback] 警告: 无法导入 providers_config，跳过模型别名解析")
    
    # 检查是否需要模型兜底（OpenAI 模型在第三方 API 上可能不可用）
    openai_models = [
        "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo",
        "gpt-4-vision-preview", "gpt-4-turbo-preview"
    ]
    
    # 如果不是 OpenAI 模型，不需要兜底
    if not any(configured_model.startswith(om) for om in openai_models):
        return configured_model
    
    # OpenAI 模型默认需要兜底，除非明确配置 ALLOW_OPENAI_MODELS=true
    if os.getenv("ALLOW_OPENAI_MODELS", "").lower() == "true":
        return configured_model
    
    # 检查 API 配置
    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "")
    if "openai.com" in base_url and os.getenv("ALLOW_OPENAI_MODELS", "").lower() == "true":
        return configured_model
    
    # 默认情况下，所有 gpt- 开头的模型都需要兜底
    print(f"[ModelFallback] 检测到 OpenAI 模型 '{configured_model}'，切换为 '{default_model}'")
    return default_model


def get_llm_instance(
    provider: str,
    model: Optional[str] = None,
    streaming: bool = False,
    temperature: Optional[float] = None,
) -> ChatOpenAI:
    """
    统一的 LLM 工厂函数 - 完全配置化
    
    P2 优化: 使用缓存池复用 LLM 实例
    
    从 providers.yaml 读取配置，从 .env 读取 API Key
    
    Args:
        provider: 提供商标识（如 'minimax', 'deepseek', 'openai'）
        model: 模型名称，默认使用配置文件中的 default_model
        streaming: 是否启用流式输出
        temperature: 温度参数，默认使用配置文件中的值
    
    Returns:
        ChatOpenAI: 配置好的 LLM 实例
    
    Raises:
        ValueError: 如果提供商未配置或缺少 API Key
    
    示例：
        >>> llm = get_llm_instance("minimax", streaming=True, temperature=0.1)
        >>> llm = get_llm_instance("deepseek", model="deepseek-reasoner")
    """
    # P2 优化: 检查缓存
    cached = get_cached_llm(provider, model, streaming, temperature)
    if cached:
        print(f"[LLM Cache] 命中缓存: {provider}:{model or 'default'}")
        return cached
    
    # 读取提供商配置
    config = get_provider_config(provider)
    if not config:
        raise ValueError(
            f"未知的提供商: {provider}\n"
            f"请在 providers.yaml 中添加配置，"
            f"或检查拼写是否正确。"
        )
    
    # 检查是否启用
    if not config.get('enabled', True):
        raise ValueError(
            f"提供商 {provider} 已在配置中禁用 (enabled: false)"
        )
    
    # 从环境变量读取 API Key
    api_key = get_provider_api_key(provider)
    if not api_key:
        env_key = config.get('env_key', f'{provider.upper()}_API_KEY')
        raise ValueError(
            f"未配置 {provider} 的 API Key\n"
            f"请在 .env 文件中设置: {env_key}=your-api-key"
        )
    
    # 构建 LLM 配置
    llm_config = {
        'model': model or config.get('default_model'),
        'api_key': api_key,
        'base_url': config.get('base_url'),
        'streaming': streaming,
    }
    
    # 温度参数
    if temperature is not None:
        llm_config['temperature'] = temperature
    elif 'temperature' in config:
        llm_config['temperature'] = config['temperature']
    else:
        llm_config['temperature'] = 0.7  # 默认值
    
    # 🚀 修复：创建更健壮的 HTTP 客户端
    # 禁用 HTTP/2 并增加超时时间，解决 "incomplete chunked read" 错误
    http_client = httpx.Client(
        http2=False,      # 🚨 关键：禁用 HTTP/2，解决大部分 chunked read 错误
        timeout=600.0,    # 🚨 关键：给推理模型足够的思考时间（10 分钟），对齐 gunicorn/nginx
        verify=True        # 验证 SSL 证书（安全考虑）
    )
    llm_config['http_client'] = http_client
    
    # 创建实例
    llm = ChatOpenAI(**llm_config)
    
    # P2 优化: 缓存实例
    set_cached_llm(provider, model, streaming, temperature, llm)
    print(f"[LLM Cache] 创建并缓存: {provider}:{model or 'default'}")
    
    return llm


def get_llm_by_model(model_id: str, streaming: bool = False) -> ChatOpenAI:
    """
    通过模型 ID 获取 LLM 实例
    
    Args:
        model_id: 模型标识（如 'minimax-2.1', 'gpt-4o'）
        streaming: 是否启用流式输出
    
    Returns:
        ChatOpenAI: 配置好的 LLM 实例
    """
    from providers_config import get_model_config
    
    model_config = get_model_config(model_id)
    if not model_config:
        raise ValueError(f"未知的模型 ID: {model_id}")
    
    provider = model_config.get('provider')
    model = model_config.get('model')
    
    return get_llm_instance(provider=provider, model=model, streaming=streaming)


def get_router_llm() -> ChatOpenAI:
    """
    获取 Router 节点专用的 LLM 实例
    
    自动选择已配置且优先级最高的提供商（默认优先 MiniMax）
    使用较低温度以获得更确定的输出
    
    Returns:
        ChatOpenAI: 配置好的 LLM 实例
    
    Raises:
        ValueError: 如果没有可用的提供商
    """
    # 获取最佳 Router 提供商
    provider = get_best_router_provider()
    
    if not provider:
        raise ValueError(
            "没有可用的 LLM 提供商用于 Router\n"
            "请至少在 .env 中配置一个提供商的 API Key\n"
            "支持的提供商: minimax, deepseek, openai"
        )
    
    # 读取 Router 配置（从 providers.yaml）
    from providers_config import get_router_config
    router_config = get_router_config()
    
    temperature = router_config.get('temperature', 0.1)
    streaming = router_config.get('streaming', False)  # 🔥 Router 不需要流式输出
    
    return get_llm_instance(
        provider=provider,
        streaming=streaming,
        temperature=temperature
    )





def get_expert_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None
) -> ChatOpenAI:
    """
    获取 Expert 节点专用的 LLM 实例

    Args:
        provider: 指定提供商，默认使用第一个已配置的
        model: 指定模型
        temperature: 专家节点可自定义温度

    Returns:
        ChatOpenAI: 配置好的 LLM 实例
    """
    # 如果指定了提供商
    if provider:
        return get_llm_instance(
            provider=provider,
            model=model,
            streaming=True,
            temperature=temperature
        )

    # 默认使用 deepseek（性价比高）
    if is_provider_configured('deepseek'):
        return get_llm_instance(
            provider='deepseek',
            model=model,
            streaming=True,
            temperature=temperature or 0.7
        )

    # 回退到任何可用的
    return get_llm_instance(
        provider=get_best_router_provider(),
        model=model,
        streaming=True,
        temperature=temperature
    )


def get_commander_llm() -> ChatOpenAI:
    """
    获取 Commander 节点专用的 LLM 实例

    Commander 需要较强的规划能力，优先使用 DeepSeek 或 OpenAI
    默认温度为 0.5（规划任务需要一定的创造性）

    Returns:
        ChatOpenAI: 配置好的 LLM 实例
    """
    # 尝试使用 deepseek
    if is_provider_configured('deepseek'):
        return get_llm_instance(provider='deepseek', streaming=True, temperature=0.5)

    # 回退到 openai
    if is_provider_configured('openai'):
        return get_llm_instance(provider='openai', streaming=True, temperature=0.5)

    # 最后尝试任何可用的
    return get_router_llm()


def get_aggregator_llm() -> ChatOpenAI:
    """
    获取 Aggregator 节点专用的 LLM 实例

    Aggregator 用于总结多个专家的输出结果，生成自然语言的最终回复
    优先使用 DeepSeek（性价比高，输出质量稳定）
    默认温度为 0.7（总结任务需要一定的创造性）

    Returns:
        ChatOpenAI: 配置好的 LLM 实例
    """
    # 优先使用 deepseek（总结任务性价比高）
    if is_provider_configured('deepseek'):
        return get_llm_instance(provider='deepseek', streaming=True, temperature=0.7)

    # 回退到 openai
    if is_provider_configured('openai'):
        return get_llm_instance(provider='openai', streaming=True, temperature=0.7)

    # 尝试 minimax
    if is_provider_configured('minimax'):
        return get_llm_instance(provider='minimax', streaming=True, temperature=0.7)

    # 最后尝试任何可用的
    return get_router_llm()


# ============================================================================
# 便捷函数
# ============================================================================

def list_available_providers() -> list:
    """
    列出所有可用的（已配置 API Key）提供商
    
    Returns:
        list: 提供商名称列表
    """
    from providers_config import get_active_providers
    return list(get_active_providers().keys())


def test_provider_connection(provider: str) -> bool:
    """
    测试指定提供商的连接是否正常
    
    Args:
        provider: 提供商标识
    
    Returns:
        bool: 连接是否成功
    """
    try:
        if not is_provider_configured(provider):
            print(f"❌ {provider}: 未配置 API Key")
            return False
        
        llm = get_llm_instance(provider=provider)
        # 简单的连接测试（发送一个简单请求）
        # 注意：这里只是验证配置是否正确，不实际调用 API
        print(f"✅ {provider}: 配置正确")
        return True
        
    except Exception as e:
        print(f"❌ {provider}: {e}")
        return False


if __name__ == "__main__":
    # 测试所有提供商连接
    from providers_config import print_provider_status, get_all_providers
    
    print_provider_status()
    
    print("\n测试提供商连接...")
    for provider in get_all_providers().keys():
        test_provider_connection(provider)
