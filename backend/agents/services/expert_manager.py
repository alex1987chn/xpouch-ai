"""
专家管理服务

从 SystemExpert 表动态加载专家 Prompt 和配置
提供专家配置管理、缓存和格式化功能

P1 优化: 使用 cachetools.TTLCache 替代自定义缓存
"""
from typing import Dict, Optional, List
from sqlmodel import Session, select
from cachetools import TTLCache
from models import SystemExpert
from utils.llm_factory import get_effective_model
from utils.logger import logger

# P1 优化: 使用 TTLCache 替代自定义缓存 + 锁
# - 自动 TTL 过期 (5分钟)
# - 线程安全 (内部已加锁)
# - 无需手动管理 timestamp
_expert_cache: TTLCache = TTLCache(maxsize=100, ttl=300)


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
        logger.warning(f"[ExpertManager] Expert '{expert_key}' not found in database")
        return None

    return _build_config(expert)


def _build_config(expert: SystemExpert) -> Dict:
    """构建专家配置（提取公共逻辑）"""
    # 应用模型兜底机制
    effective_model = get_effective_model(expert.model)

    config = {
        "expert_key": expert.expert_key,
        "name": expert.name,
        "system_prompt": expert.system_prompt,
        "model": effective_model,
        "temperature": expert.temperature
    }

    # 推断 provider
    config["provider"] = _infer_provider(effective_model)

    return config


def _infer_provider(model: str) -> Optional[str]:
    """从模型名称推断 provider"""
    try:
        from providers_config import get_model_config
        model_config = get_model_config(model)
        if model_config and 'provider' in model_config:
            return model_config['provider']
    except ImportError:
        pass

    # 启发式推断
    model_lower = model.lower()
    if model_lower.startswith('minimax'):
        return 'minimax'
    elif model_lower.startswith('deepseek'):
        return 'deepseek'
    elif model_lower.startswith('gpt'):
        return 'openai'
    elif model_lower.startswith('kimi'):
        return 'moonshot'
    elif model_lower.startswith('claude'):
        return 'anthropic'

    return None


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
    return {expert.expert_key: _build_config(expert) for expert in experts}


def get_expert_prompt_cached(
    expert_key: str,
    session: Optional[Session] = None
) -> Optional[str]:
    """
    获取专家 Prompt（带缓存）

    缓存策略：
    - TTL 自动过期（5分钟）
    - 线程安全（cachetools 内部已加锁）

    Args:
        expert_key: 专家类型标识
        session: 数据库会话（可选，如果缓存为空时使用）

    Returns:
        str: 专家系统提示词
    """
    # 尝试从缓存读取
    if expert_key in _expert_cache:
        config = _expert_cache[expert_key]
        return config.get("system_prompt")

    # 缓存未命中，加载所有专家
    if session:
        experts = load_all_experts(session)
        _expert_cache.update(experts)
        config = _expert_cache.get(expert_key)
        if config:
            return config.get("system_prompt")

    logger.warning(f"[ExpertManager] Expert '{expert_key}' not found in cache")
    return None


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
    # 尝试从缓存读取
    if expert_key in _expert_cache:
        return _expert_cache[expert_key]

    # 缓存未命中，加载所有专家
    if session:
        experts = load_all_experts(session)
        _expert_cache.update(experts)
        return _expert_cache.get(expert_key)

    return None


def refresh_cache(session: Optional[Session] = None):
    """
    刷新专家配置缓存

    管理员更新专家配置后，可调用此函数刷新缓存

    Args:
        session: 数据库会话（可选）
    """
    _expert_cache.clear()
    if session:
        experts = load_all_experts(session)
        _expert_cache.update(experts)


def force_refresh_all():
    """
    强制刷新所有专家配置

    用于 API 调用后立即刷新缓存
    """
    _expert_cache.clear()


def get_all_expert_list(db_session: Optional[Session] = None) -> List[tuple]:
    """
    获取所有可用专家的列表（包括动态创建的专家）

    Args:
        db_session: 数据库会话

    Returns:
        List[tuple]: 专家列表 [(expert_key, name, description), ...]
    """
    fallback_experts = [
        ("search", "搜索专家", "用于搜索、查询信息"),
        ("coder", "编程专家", "用于代码编写、调试、优化"),
        ("researcher", "研究专家", "用于深入研究、文献调研"),
        ("analyzer", "分析专家", "用于数据分析、逻辑推理"),
        ("writer", "写作专家", "用于文案撰写、内容创作"),
        ("planner", "规划专家", "用于任务规划、方案设计"),
    ]

    if db_session is None:
        logger.info("[ExpertManager] 未提供数据库会话，使用硬编码专家列表")
        return fallback_experts

    try:
        experts = db_session.exec(
            select(SystemExpert).order_by(SystemExpert.expert_key)
        ).all()

        result = [
            (e.expert_key, e.name, e.description or "暂无描述")
            for e in experts
        ]
        logger.info(f"[ExpertManager] 从数据库加载了 {len(result)} 个专家")
        return result

    except Exception as e:
        logger.warning(f"[ExpertManager] 获取专家列表失败: {e}，使用硬编码列表")
        return fallback_experts


def format_expert_list_for_prompt(experts: List[tuple]) -> str:
    """
    将专家列表格式化为适合插入 Prompt 的字符串

    Args:
        experts: 专家列表

    Returns:
        str: 格式化后的专家列表字符串
    """
    if not experts:
        return "（暂无可用专家）"

    return "\n".join(
        f"- {key} ({name}): {desc}"
        for key, name, desc in experts
    )
