"""
通用 DTO
"""

from pydantic import BaseModel


class LangSmithConfig(BaseModel):
    """LangSmith 追踪配置"""

    enabled: bool = False
    api_key: str | None = None
    project_name: str = "xpouch-ai"
    tracing_v2: bool = False

    @classmethod
    def from_env(cls) -> "LangSmithConfig":
        """从环境变量加载配置"""
        from config import get_langsmith_config

        return get_langsmith_config()
