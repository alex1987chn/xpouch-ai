"""
LLM 提供商配置管理模块

负责：
1. 加载 providers.yaml 配置文件
2. 安全校验（确保 yaml 中不包含敏感信息）
3. 提供统一的配置访问接口
4. 缓存配置以提高性能

安全说明：
- 本模块只读取 providers.yaml 中的非敏感配置
- API Key 必须从环境变量读取
- 启动时会进行安全检查，防止敏感信息泄露到 yaml 文件
"""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from functools import lru_cache
from dotenv import load_dotenv

# 加载环境变量
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

try:
    import yaml
except ImportError:
    print("[ERROR] 请先安装 PyYAML: pip install pyyaml")
    sys.exit(1)


# ============================================================================
# 配置加载
# ============================================================================

@lru_cache()
def load_providers_config() -> Dict[str, Any]:
    """
    加载 providers.yaml 配置文件（带缓存）
    
    Returns:
        Dict: 完整的配置字典
    """
    config_path = Path(__file__).parent / "providers.yaml"
    
    if not config_path.exists():
        raise FileNotFoundError(f"配置文件不存在: {config_path}")
    
    with open(config_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    
    # 安全检查
    _security_check(config, config_path)
    
    return config


def _security_check(config: Dict, config_path: Path) -> None:
    """
    安全检查：确保 yaml 文件中不包含敏感信息
    
    Args:
        config: 配置字典
        config_path: 配置文件路径
    
    Raises:
        ValueError: 如果发现敏感信息
    """
    forbidden_keys = ['api_key', 'apikey', 'key', 'secret', 'password', 'token']
    
    def check_dict(d: Dict, path: str = ""):
        for key, value in d.items():
            current_path = f"{path}.{key}" if path else key
            
            # 检查 key 名是否包含敏感词
            if any(forbidden in key.lower() for forbidden in forbidden_keys):
                if key != 'env_key':  # env_key 是允许的
                    raise ValueError(
                        f"[安全错误] providers.yaml 包含敏感字段: {current_path}\n"
                        f"API Key 等敏感信息必须在 .env 文件中设置，"
                        f"不要在 providers.yaml 中硬编码！"
                    )
            
            # 检查值是否看起来像 API Key
            if isinstance(value, str):
                if value.startswith(('sk-', 'ak-', 'pk-')) and len(value) > 20:
                    raise ValueError(
                        f"[安全错误] providers.yaml 可能包含 API Key: {current_path}\n"
                        f"请将此值移至 .env 文件！"
                    )
            
            # 递归检查
            if isinstance(value, dict):
                check_dict(value, current_path)
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    if isinstance(item, dict):
                        check_dict(item, f"{current_path}[{i}]")
    
    try:
        check_dict(config)
    except ValueError as e:
        print(f"\n{'='*60}")
        print("配置安全检查失败！")
        print(f"{'='*60}")
        print(e)
        print(f"\n文件位置: {config_path}")
        print(f"{'='*60}\n")
        raise


# ============================================================================
# 提供商配置获取
# ============================================================================

def get_provider_config(provider: str) -> Optional[Dict[str, Any]]:
    """
    获取指定提供商的完整配置
    
    Args:
        provider: 提供商标识（如 'minimax', 'deepseek'）
    
    Returns:
        配置字典，如果不存在返回 None
    """
    config = load_providers_config()
    return config.get('providers', {}).get(provider)


def get_all_providers() -> Dict[str, Dict[str, Any]]:
    """
    获取所有提供商配置
    
    Returns:
        Dict: 所有提供商的配置字典
    """
    config = load_providers_config()
    return config.get('providers', {})


def get_active_providers() -> Dict[str, Dict[str, Any]]:
    """
    获取所有已激活且有 API Key 的提供商
    
    Returns:
        Dict: 已激活的提供商配置
    """
    all_providers = get_all_providers()
    active = {}
    
    for name, config in all_providers.items():
        if not config.get('enabled', True):
            continue
        
        env_key = config.get('env_key')
        if env_key and os.getenv(env_key):
            active[name] = config
    
    return active


def get_provider_api_key(provider: str) -> Optional[str]:
    """
    获取指定提供商的 API Key（从环境变量）
    
    Args:
        provider: 提供商标识
    
    Returns:
        API Key 或 None
    """
    config = get_provider_config(provider)
    if not config:
        return None
    
    env_key = config.get('env_key')
    if env_key:
        return os.getenv(env_key)
    
    return None


def is_provider_configured(provider: str) -> bool:
    """
    检查指定提供商是否已配置（有 API Key）
    
    Args:
        provider: 提供商标识
    
    Returns:
        bool: 是否已配置
    """
    return get_provider_api_key(provider) is not None


# ============================================================================
# 模型配置获取
# ============================================================================

def get_model_config(model_id: str) -> Optional[Dict[str, Any]]:
    """
    获取指定模型的配置

    Args:
        model_id: 模型标识（如 'minimax-2.1', 'gpt-4o'）

    Returns:
        模型配置字典，如果不存在返回 None
        注意：会合并 provider 的默认配置（如 temperature）
    """
    config = load_providers_config()
    model_config = config.get('models', {}).get(model_id)

    if model_config:
        # 合并 provider 默认配置到模型配置
        provider_name = model_config.get('provider')
        if provider_name:
            provider_config = get_provider_config(provider_name)
            if provider_config:
                # 如果模型没有 temperature，使用 provider 默认值
                if 'temperature' not in model_config and 'temperature' in provider_config:
                    model_config = {**model_config, 'temperature': provider_config['temperature']}

    return model_config


def get_models_by_provider(provider: str) -> List[Dict[str, Any]]:
    """
    获取指定提供商的所有模型
    
    Args:
        provider: 提供商标识
    
    Returns:
        List: 模型配置列表
    """
    config = load_providers_config()
    models = []
    
    for model_id, model_config in config.get('models', {}).items():
        if model_config.get('provider') == provider:
            models.append({
                'id': model_id,
                **model_config
            })
    
    return models


# ============================================================================
# Router 配置获取
# ============================================================================

def get_router_config() -> Dict[str, Any]:
    """
    获取 Router 节点的专用配置
    
    Returns:
        Router 配置字典
    """
    config = load_providers_config()
    return config.get('router', {})


def get_router_priority_providers() -> List[str]:
    """
    获取 Router 的优先级提供商列表
    
    Returns:
        List[str]: 按优先级排序的提供商名称列表
    """
    router_config = get_router_config()
    priority = router_config.get('priority_providers', [])
    
    # 如果没有配置，按 priority 字段排序
    if not priority:
        providers = get_active_providers()
        sorted_providers = sorted(
            providers.items(),
            key=lambda x: x[1].get('priority', 99)
        )
        priority = [name for name, _ in sorted_providers]
    
    return priority


def get_best_router_provider() -> Optional[str]:
    """
    获取最适合 Router 使用的提供商（已配置且优先级最高）
    
    Returns:
        str: 提供商名称，如果没有可用的返回 None
    """
    priority_list = get_router_priority_providers()
    
    for provider in priority_list:
        if is_provider_configured(provider):
            return provider
    
    return None


# ============================================================================
# 配置验证和诊断
# ============================================================================

def validate_all_providers() -> Dict[str, Any]:
    """
    验证所有提供商配置
    
    Returns:
        Dict: 验证结果
    """
    all_providers = get_all_providers()
    results = {
        'configured': [],
        'missing_key': [],
        'disabled': [],
        'total': len(all_providers)
    }
    
    for name, config in all_providers.items():
        if not config.get('enabled', True):
            results['disabled'].append(name)
            continue
        
        if is_provider_configured(name):
            results['configured'].append({
                'name': name,
                'display_name': config.get('name', name),
                'default_model': config.get('default_model'),
                'env_key': config.get('env_key')
            })
        else:
            results['missing_key'].append({
                'name': name,
                'env_key': config.get('env_key')
            })
    
    return results


def print_provider_status():
    """
    打印所有提供商的状态（用于启动时诊断）
    """
    results = validate_all_providers()
    
    print("\n" + "="*60)
    print("LLM 提供商配置状态")
    print("="*60)
    
    if results['configured']:
        print(f"\n✅ 已配置 ({len(results['configured'])}):")
        for p in results['configured']:
            print(f"   • {p['display_name']} ({p['name']}) - {p['default_model']}")
    
    if results['missing_key']:
        print(f"\n⚠️  未配置 API Key ({len(results['missing_key'])}):")
        for p in results['missing_key']:
            print(f"   • {p['name']} - 请设置 {p['env_key']}")
    
    if results['disabled']:
        print(f"\n🚫 已禁用 ({len(results['disabled'])}):")
        for name in results['disabled']:
            print(f"   • {name}")
    
    # Router 推荐
    router_provider = get_best_router_provider()
    if router_provider:
        print(f"\n🚀 Router 将使用: {router_provider}")
    else:
        print("\n❌ 错误: 没有可用的 LLM 提供商！")
    
    print("="*60 + "\n")
    
    return len(results['configured']) > 0


# ============================================================================
# 热重载支持（开发环境）
# ============================================================================

def reload_config():
    """
    重新加载配置（用于开发环境热重载）
    """
    global load_providers_config
    load_providers_config.cache_clear()
    print("[INFO] 提供商配置已重新加载")


# ============================================================================
# 启动时自动验证
# ============================================================================

if __name__ == "__main__":
    # 直接运行此文件进行配置检查
    print_provider_status()
