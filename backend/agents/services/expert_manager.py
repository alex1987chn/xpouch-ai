"""
专家管理服务

从 SystemExpert 表动态加载专家 Prompt 和配置
提供专家配置管理、缓存和格式化功能

P1 修复: 添加线程锁保护全局缓存
"""
import threading
import time
from typing import Dict, Optional, List
from sqlmodel import Session, select
from models import SystemExpert
from utils.llm_factory import get_effective_model

# P1 修复: 添加线程锁保护全局缓存
_cache_lock = threading.Lock()

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
        print(f"[ExpertManager] Expert '{expert_key}' not found in database")
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

    P1 修复: 使用线程锁保护缓存访问

    Args:
        expert_key: 专家类型标识
        session: 数据库会话（可选，如果缓存为空时使用）

    Returns:
        str: 专家系统提示词
    """
    global _expert_cache, _cache_timestamp

    # P1 修复: 使用锁保护缓存访问
    with _cache_lock:
        # 如果缓存为空且提供了 session，加载所有专家
        if not _expert_cache and session:
            _expert_cache = load_all_experts(session)
            _cache_timestamp = time.time()

        # 从缓存读取
        config = _expert_cache.get(expert_key)

    if not config:
        print(f"[ExpertManager] Expert '{expert_key}' not found in cache")
        return None

    return config["system_prompt"]


def get_expert_config_cached(
    expert_key: str,
    session: Optional[Session] = None
) -> Optional[Dict]:
    """
    获取专家完整配置（带缓存）

    P1 修复: 使用线程锁保护缓存访问

    Args:
        expert_key: 专家类型标识
        session: 数据库会话（可选，如果缓存为空时使用）

    Returns:
        Dict: 专家完整配置
    """
    global _expert_cache, _cache_timestamp

    # P1 修复: 使用锁保护缓存访问
    with _cache_lock:
        # 如果缓存为空且提供了 session，加载所有专家
        if not _expert_cache and session:
            _expert_cache = load_all_experts(session)
            _cache_timestamp = time.time()

        # 从缓存读取
        return _expert_cache.get(expert_key)


def refresh_cache(session: Optional[Session] = None):
    """
    刷新专家配置缓存

    管理员更新专家配置后，可调用此函数刷新缓存

    P1 修复: 使用线程锁保护缓存更新

    Args:
        session: 数据库会话（可选，如果不提供则使用全局缓存）
    """
    global _expert_cache, _cache_timestamp

    # P1 修复: 使用锁保护缓存更新
    with _cache_lock:
        _expert_cache = load_all_experts(session)
        _cache_timestamp = time.time()


def force_refresh_all():
    """
    强制刷新所有专家配置（不依赖 session）

    用于 API 调用后立即刷新缓存

    P1 修复: 使用线程锁保护缓存清空
    """
    global _expert_cache, _cache_timestamp

    # P1 修复: 使用锁保护缓存清空
    with _cache_lock:
        _expert_cache = {}
        _cache_timestamp = None


def get_all_expert_list(db_session: Optional[Session] = None) -> List[tuple]:
    """
    获取所有可用专家的列表（包括动态创建的专家）

    从数据库中获取所有 SystemExpert 记录，返回格式化的专家信息列表。
    用于 Commander Node 动态注入专家列表到 System Prompt。

    Args:
        db_session: 数据库会话，如果为 None 则返回硬编码专家列表

    Returns:
        List[tuple]: 专家列表，每个元素为 (expert_key, name, description) 元组

    Example:
        >>> experts = get_all_expert_list(db_session)
        >>> print(experts)
        [('search', '搜索专家', '擅长信息搜索和查询'), ('coder', '编程专家', '擅长代码编写和调试')]
    """
    # 硬编码专家列表作为回退
    fallback_experts = [
        ("search", "搜索专家", "用于搜索、查询信息"),
        ("coder", "编程专家", "用于代码编写、调试、优化"),
        ("researcher", "研究专家", "用于深入研究、文献调研"),
        ("analyzer", "分析专家", "用于数据分析、逻辑推理"),
        ("writer", "写作专家", "用于文案撰写、内容创作"),
        ("planner", "规划专家", "用于任务规划、方案设计"),
        ("image_analyzer", "图片分析专家", "用于图片内容分析、视觉识别"),
    ]

    # 如果没有提供数据库会话，直接返回硬编码列表
    if db_session is None:
        print("[ExpertManager] 未提供数据库会话，使用硬编码专家列表")
        return fallback_experts

    experts = []

    try:
        # 从数据库查询所有 SystemExpert（包括动态创建的）
        statement = select(SystemExpert).order_by(SystemExpert.expert_key)
        results = db_session.exec(statement).all()

        for expert in results:
            experts.append((
                expert.expert_key,
                expert.name,
                expert.description or "暂无描述"
            ))

        print(f"[ExpertManager] 从数据库加载了 {len(experts)} 个专家")

    except Exception as e:
        print(f"[ExpertManager] 获取专家列表失败: {e}，使用硬编码列表")
        # 发生异常时返回硬编码的专家列表
        experts = fallback_experts

    return experts


def format_expert_list_for_prompt(experts: List[tuple]) -> str:
    """
    将专家列表格式化为适合插入 Prompt 的字符串

    格式：- expert_key (Name): Description

    Args:
        experts: 专家列表，每个元素为 (expert_key, name, description) 元组

    Returns:
        str: 格式化后的专家列表字符串

    Example:
        >>> experts = [('search', '搜索专家', '擅长信息搜索')]
        >>> format_expert_list_for_prompt(experts)
        '- search (搜索专家): 擅长信息搜索'
    """
    if not experts:
        return "（暂无可用专家）"

    lines = []
    for expert_key, name, description in experts:
        lines.append(f"- {expert_key} ({name}): {description}")

    return "\n".join(lines)
