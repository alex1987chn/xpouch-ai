"""
专家配置加载器

从 SystemExpert 表动态加载专家 Prompt 和配置
"""
from typing import Dict, Optional
from sqlmodel import Session, select
from models import SystemExpert
from agents.model_fallback import get_effective_model

# 内存缓存（避免每次查询数据库）
_expert_cache: Dict[str, Dict] = {}
_cache_timestamp: Optional[float] = None


def get_expert_config(
    expert_key: str,
    session: Session
) -> Optional[Dict]:
    """
    从数据库获取专家配置

    Args:
        expert_key: 专家类型标识（如 'coder', 'search'）
        session: 数据库会话

    Returns:
        Dict: 专家配置 {
            "expert_key": str,
            "name": str,
            "system_prompt": str,
            "model": str,
            "temperature": float
        }
    """
    expert = session.exec(
        select(SystemExpert).where(SystemExpert.expert_key == expert_key)
    ).first()

    if not expert:
        print(f"[ExpertLoader] Expert '{expert_key}' not found in database")
        return None

    # 应用模型兜底机制
    effective_model = get_effective_model(expert.model)

    # 构建配置
    config = {
        "expert_key": expert.expert_key,
        "name": expert.name,
        "system_prompt": expert.system_prompt,
        "model": effective_model,
        "temperature": expert.temperature
    }

    # 尝试获取模型配置以确定 provider
    try:
        from providers_config import get_model_config
        model_config = get_model_config(effective_model)
        if model_config and 'provider' in model_config:
            config["provider"] = model_config['provider']
        else:
            # 从模型名称推断 provider（简单启发式）
            model_lower = effective_model.lower()
            if model_lower.startswith('minimax'):
                config["provider"] = 'minimax'
            elif model_lower.startswith('deepseek'):
                config["provider"] = 'deepseek'
            elif model_lower.startswith('gpt'):
                config["provider"] = 'openai'
            elif model_lower.startswith('kimi'):
                config["provider"] = 'moonshot'
            else:
                config["provider"] = None
    except ImportError:
        config["provider"] = None

    return config


def get_expert_prompt(
    expert_key: str,
    session: Session
) -> Optional[str]:
    """
    获取专家 Prompt（便捷函数）

    Args:
        expert_key: 专家类型标识
        session: 数据库会话

    Returns:
        str: 专家系统提示词
    """
    config = get_expert_config(expert_key, session)
    return config["system_prompt"] if config else None


def load_all_experts(session: Session) -> Dict[str, Dict]:
    """
    从数据库加载所有专家配置

    Args:
        session: 数据库会话

    Returns:
        Dict: 所有专家配置 {expert_key: config}
    """
    experts = session.exec(select(SystemExpert)).all()

    config_map = {}
    for expert in experts:
        # 应用模型兜底机制
        effective_model = get_effective_model(expert.model)
        config = {
            "expert_key": expert.expert_key,
            "name": expert.name,
            "system_prompt": expert.system_prompt,
            "model": effective_model,
            "temperature": expert.temperature
        }
        
        # 尝试获取模型配置以确定 provider
        try:
            from providers_config import get_model_config
            model_config = get_model_config(effective_model)
            if model_config and 'provider' in model_config:
                config["provider"] = model_config['provider']
            else:
                # 从模型名称推断 provider（简单启发式）
                model_lower = effective_model.lower()
                if model_lower.startswith('minimax'):
                    config["provider"] = 'minimax'
                elif model_lower.startswith('deepseek'):
                    config["provider"] = 'deepseek'
                elif model_lower.startswith('gpt'):
                    config["provider"] = 'openai'
                elif model_lower.startswith('kimi'):
                    config["provider"] = 'moonshot'
                else:
                    config["provider"] = None
        except ImportError:
            config["provider"] = None
            
        config_map[expert.expert_key] = config

    print(f"[ExpertLoader] Loaded {len(config_map)} experts from database")
    return config_map


def get_expert_prompt_cached(
    expert_key: str,
    session: Optional[Session] = None
) -> Optional[str]:
    """
    获取专家 Prompt（带缓存）

    缓存策略：
    - 启动时预加载所有专家到内存
    - 后续请求直接从内存读取
    - 可选：定期刷新缓存（如每60秒）

    Args:
        expert_key: 专家类型标识
        session: 数据库会话（可选，如果缓存为空时使用）

    Returns:
        str: 专家系统提示词
    """
    global _expert_cache, _cache_timestamp

    # 如果缓存为空且提供了 session，加载所有专家
    if not _expert_cache and session:
        _expert_cache = load_all_experts(session)
        import time
        _cache_timestamp = time.time()

    # 从缓存读取
    config = _expert_cache.get(expert_key)

    if not config:
        print(f"[ExpertLoader] Expert '{expert_key}' not found in cache")
        return None

    return config["system_prompt"]


def get_expert_config_cached(
    expert_key: str,
    session: Optional[Session] = None
) -> Optional[Dict]:
    """
    获取专家完整配置（带缓存）

    Args:
        expert_key: 专家类型标识
        session: 数据库会话（可选，如果缓存为空时使用）

    Returns:
        Dict: 专家完整配置
    """
    global _expert_cache, _cache_timestamp

    # 如果缓存为空且提供了 session，加载所有专家
    if not _expert_cache and session:
        _expert_cache = load_all_experts(session)
        import time
        _cache_timestamp = time.time()

    # 从缓存读取
    return _expert_cache.get(expert_key)


def refresh_cache(session: Optional[Session] = None):
    """
    刷新专家配置缓存

    管理员更新专家配置后，可调用此函数刷新缓存

    Args:
        session: 数据库会话（可选，如果不提供则使用全局缓存）
    """
    global _expert_cache, _cache_timestamp
    import time

    _expert_cache = load_all_experts(session)
    _cache_timestamp = time.time()

    print(f"[ExpertLoader] Expert cache refreshed at {_cache_timestamp}")
    print(f"[ExpertLoader] Cache now contains {len(_expert_cache)} experts")


def force_refresh_all():
    """
    强制刷新所有专家配置（不依赖 session）

    用于 API 调用后立即刷新缓存
    """
    global _expert_cache, _cache_timestamp
    import time

    # 清空缓存，下次查询时会自动重新加载
    _expert_cache = {}
    _cache_timestamp = None

    print(f"[ExpertLoader] Cache cleared and will be reloaded on next access")
