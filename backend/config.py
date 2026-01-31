"""
后端配置管理
用于加载环境变量、初始化 LangChain 客户端和 LangSmith 追踪
"""
import os
from typing import Optional
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()


# ============================================================================
# API 配置
# ============================================================================

PORT = int(os.getenv("PORT", "3002"))


# ============================================================================
# LLM 提供商配置
# ============================================================================

# OpenAI 配置
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

# DeepSeek 配置
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")

# Anthropic 配置（可选）
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Google 配置（可选）
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")


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
        print("[INFO] LangSmith 追踪未启用（设置 LANGCHAIN_TRACING_V2=true 启用）")
        return

    if not config["api_key"]:
        print("[WARN] LangSmith 已启用，但未设置 LANGCHAIN_API_KEY")
        return

    # 设置环境变量（LangChain 自动读取）
    os.environ["LANGCHAIN_TRACING_V2"] = str(config["tracing_v2"]).lower()
    os.environ["LANGCHAIN_API_KEY"] = config["api_key"]
    os.environ["LANGCHAIN_PROJECT"] = config["project_name"]

    print(f"[OK] LangSmith 追踪已启用")
    print(f"   - 项目: {config['project_name']}")
    print(f"   - V2 追踪: {config['tracing_v2']}")


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
    # 检查是否有至少一个 LLM API Key
    has_llm = any([
        OPENAI_API_KEY,
        DEEPSEEK_API_KEY,
        ANTHROPIC_API_KEY,
        GOOGLE_API_KEY,
    ])
    
    if not has_llm:
        print("[WARN] 警告: 未配置任何 LLM API Key")
        print("   请在 .env 文件中设置 OPENAI_API_KEY 或 DEEPSEEK_API_KEY")
        return False
    
    # 检查 LangSmith 配置
    langsmith = get_langsmith_config()
    if langsmith["enabled"] and not langsmith["api_key"]:
        print("[WARN] 警告: LangSmith 已启用但未设置 LANGCHAIN_API_KEY")
        return False

    print("[OK] 配置验证通过")
    return True


# ============================================================================
# 模块初始化
# ============================================================================

# 自动初始化 LangSmith 追踪
init_langchain_tracing()

# 验证配置
validate_config()
