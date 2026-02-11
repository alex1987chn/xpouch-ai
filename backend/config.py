"""
后端配置管理
用于加载环境变量、初始化 LangChain 客户端和 LangSmith 追踪
"""
import os
import logging
from typing import Optional
from dotenv import load_dotenv

# 配置日志
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

# ============================================================================
# API 配置
# ============================================================================

PORT = int(os.getenv("PORT", "3002"))


# ============================================================================
# LLM 提供商配置（已迁移到 providers.yaml）
# ============================================================================
# 注意：所有 LLM 配置现在统一在 providers.yaml 中管理
# 此文件不再包含具体的提供商配置
# 使用方式：
#   from providers_config import get_provider_config, get_active_providers
#   from utils.llm_factory import get_llm_instance
# ============================================================================


# ============================================================================
# LangSmith 追踪配置
# ============================================================================

def get_langsmith_config() -> dict:
    """
    获取 LangSmith 追踪配置
    
    返回格式符合 LangChain 初始化要求：
    {
        "enabled": bool,
        "api_key": str | None,
        "project_name": str,
        "tracing_v2": bool
    }
    """
    # 读取一次环境变量，复用于 enabled 和 tracing_v2
    tracing_v2 = os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"
    api_key = os.getenv("LANGCHAIN_API_KEY")
    project_name = os.getenv("LANGCHAIN_PROJECT", "xpouch-ai")
    
    return {
        "enabled": tracing_v2,  # 复用 tracing_v2 值
        "api_key": api_key,
        "project_name": project_name,
        "tracing_v2": tracing_v2,
    }


def init_langchain_tracing():
    """
    初始化 LangChain 追踪（LangSmith）
    
    在应用启动时调用此函数，配置全局追踪设置
    """
    config = get_langsmith_config()
    
    if not config["enabled"]:
        logger.info("LangSmith 追踪未启用（设置 LANGCHAIN_TRACING_V2=true 启用）")
        return

    if not config["api_key"]:
        logger.warning("LangSmith 已启用，但未设置 LANGCHAIN_API_KEY")
        return

    # 设置环境变量（LangChain 自动读取）
    os.environ["LANGCHAIN_TRACING_V2"] = str(config["tracing_v2"]).lower()
    os.environ["LANGCHAIN_API_KEY"] = config["api_key"]
    os.environ["LANGCHAIN_PROJECT"] = config["project_name"]

    logger.info(f"LangSmith 追踪已启用 | 项目: {config['project_name']} | V2: {config['tracing_v2']}")


# ============================================================================
# 数据库配置
# ============================================================================

# 数据库文件路径
DATABASE_FILE = os.path.join("data", "database.db")

# 数据库连接 URL
DATABASE_URL = f"sqlite:///{DATABASE_FILE}"


# ============================================================================
# 专家类型配置（超智能体系统）
# ============================================================================

# 可用的专家类型
EXPERT_TYPES = [
    "search",       # 信息搜索专家
    "coder",       # 编程专家
    "researcher",  # 研究专家
    "analyzer",    # 分析专家
    "writer",      # 写作专家
    "planner",     # 规划专家
]

# 专家显示名称映射
EXPERT_NAMES = {
    "search": "信息搜索专家",
    "coder": "编程专家",
    "researcher": "研究专家",
    "analyzer": "分析专家",
    "writer": "写作专家",
    "planner": "规划专家",
}


# ============================================================================
# 验证函数
# ============================================================================

def validate_config() -> bool:
    """
    验证配置是否完整

    Returns:
        bool: 配置是否有效
    """
    # 导入新的配置验证
    from providers_config import print_provider_status, print_embedding_status

    # 验证 LLM 提供商配置
    has_llm = print_provider_status()

    # 验证嵌入模型配置
    has_embedding = print_embedding_status()

    # 检查 LangSmith 配置
    langsmith = get_langsmith_config()
    if langsmith["enabled"] and not langsmith["api_key"]:
        logger.warning("LangSmith 已启用但未设置 LANGCHAIN_API_KEY")
        return False

    # LLM 和嵌入模型至少配置一个
    return has_llm or has_embedding


# ============================================================================
# 模块初始化
# ============================================================================

# 自动初始化 LangSmith 追踪
init_langchain_tracing()

# 验证配置
validate_config()


# ============================================================================
# SSE 流式配置
# ============================================================================

# 心跳间隔配置
HEARTBEAT_INTERVAL: float = 15.0          # 正常心跳间隔(秒)
FORCE_HEARTBEAT_INTERVAL: float = 30.0     # 强制心跳间隔(秒)
STREAM_TIMEOUT: float = 30.0               # 流式超时(秒)

# 执行限制
RECURSION_LIMIT: int = 100                 # 递归深度限制
