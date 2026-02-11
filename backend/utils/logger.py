"""
日志工具模块

提供统一的日志记录器获取方式
"""
import logging

# 默认日志格式
DEFAULT_FORMAT = '%(levelname)s: %(message)s'


def get_logger(name: str) -> logging.Logger:
    """
    获取一个配置好的日志记录器
    
    Args:
        name: 记录器名称，通常使用 __name__
        
    Returns:
        配置好的 Logger 实例
    """
    return logging.getLogger(name)


# 兼容旧代码的导出方式
logger = get_logger(__name__)
