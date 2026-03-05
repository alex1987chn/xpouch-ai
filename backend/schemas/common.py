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
        from config import settings

        return {
            "enabled": settings.langchain_tracing_v2,
            "api_key": settings.langchain_api_key.get_secret_value() if settings.langchain_api_key else None,
            "project_name": settings.langchain_project,
            "tracing_v2": settings.langchain_tracing_v2,
        }
