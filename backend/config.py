"""
XPouch AI 配置管理 - Pydantic Settings 最佳实践

用法：
    from config import settings
    port = settings.port
    api_key = settings.deepseek_api_key.get_secret_value()

安全：
    - 敏感信息使用 SecretStr，打印时自动脱敏
    - 生产环境强制验证

注意：
    - 本模块只定义配置，不执行初始化（避免循环导入）
    - 初始化在 main.py lifespan 中执行
"""

from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    应用配置 - 从 backend/.env 读取
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # 基础配置
    app_name: str = Field(default="XPouch AI", alias="APP_NAME")
    version: str = Field(default="3.3.0", alias="VERSION")
    environment: Literal["development", "testing", "production"] = "development"
    port: int = Field(default=3002, alias="PORT")

    # 数据库
    database_url: str = Field(default="", alias="DATABASE_URL")

    # 数据库连接池配置（用于 LangGraph Checkpointer）
    db_pool_min_size: int = Field(default=5, alias="DB_POOL_MIN_SIZE")
    db_pool_max_size: int = Field(default=20, alias="DB_POOL_MAX_SIZE")
    db_pool_timeout: float = Field(default=30.0, alias="DB_POOL_TIMEOUT")
    db_pool_max_idle: float = Field(
        default=300.0, alias="DB_POOL_MAX_IDLE"
    )  # 5 分钟，与 pool_recycle 保持一致，防止云数据库断开
    db_pool_max_lifetime: float = Field(default=7200.0, alias="DB_POOL_MAX_LIFETIME")  # 2 小时

    # LLM API Keys（自动脱敏）
    deepseek_api_key: SecretStr | None = Field(default=None, alias="DEEPSEEK_API_KEY")
    openai_api_key: SecretStr | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: SecretStr | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    minimax_api_key: SecretStr | None = Field(default=None, alias="MINIMAX_API_KEY")
    moonshot_api_key: SecretStr | None = Field(default=None, alias="MOONSHOT_API_KEY")
    google_api_key: SecretStr | None = Field(default=None, alias="GOOGLE_API_KEY")

    # 认证
    jwt_secret_key: SecretStr = Field(default=SecretStr("dev-secret-only"), alias="JWT_SECRET_KEY")
    access_token_expire_days: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_DAYS")
    refresh_token_expire_days: int = Field(default=60, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    # LangSmith
    langchain_tracing_v2: bool = Field(default=False, alias="LANGCHAIN_TRACING_V2")
    langchain_api_key: SecretStr | None = Field(default=None, alias="LANGCHAIN_API_KEY")
    langchain_project: str = Field(default="xpouch-ai", alias="LANGCHAIN_PROJECT")

    # 工具配置
    tavily_api_key: SecretStr | None = Field(default=None, alias="TAVILY_API_KEY")
    silicon_api_key: SecretStr | None = Field(default=None, alias="SILICON_API_KEY")

    # 功能开关
    enable_hitl: bool = Field(default=True, alias="ENABLE_HITL")
    enable_mcp: bool = Field(default=True, alias="ENABLE_MCP")
    enable_memory: bool = Field(default=True, alias="ENABLE_MEMORY")

    # 会话清理
    session_cleanup_interval_minutes: int = Field(
        default=60, alias="SESSION_CLEANUP_INTERVAL_MINUTES"
    )
    thread_retention_days: int = Field(default=90, alias="THREAD_RETENTION_DAYS")

    # SSE 流式配置
    heartbeat_interval: float = Field(default=15.0, alias="HEARTBEAT_INTERVAL")
    force_heartbeat_interval: float = Field(default=30.0, alias="FORCE_HEARTBEAT_INTERVAL")
    stream_timeout: float = Field(default=120.0, alias="STREAM_TIMEOUT")
    recursion_limit: int = Field(default=100, alias="RECURSION_LIMIT")
    run_deadline_seconds: int = Field(default=900, alias="RUN_DEADLINE_SECONDS")
    run_max_graph_loops: int = Field(default=50, alias="RUN_MAX_GRAPH_LOOPS")

    # 安全限制
    max_upload_size_mb: int = Field(default=10, alias="MAX_UPLOAD_SIZE_MB")
    request_timeout_seconds: int = Field(default=120, alias="REQUEST_TIMEOUT_SECONDS")

    # 初始管理员配置（方案1：环境变量）
    initial_admin_email: str | None = Field(default=None, alias="INITIAL_ADMIN_EMAIL")
    initial_admin_phone: str | None = Field(default=None, alias="INITIAL_ADMIN_PHONE")

    # 腾讯云短信（可选）
    tencent_cloud_secret_id: str | None = Field(default=None, alias="TENCENT_CLOUD_SECRET_ID")
    tencent_cloud_secret_key: SecretStr | None = Field(
        default=None, alias="TENCENT_CLOUD_SECRET_KEY"
    )
    sms_sdk_app_id: str | None = Field(default=None, alias="SMS_SDK_APP_ID")
    sms_sign_name: str | None = Field(default=None, alias="SMS_SIGN_NAME")
    sms_template_id: str | None = Field(default=None, alias="SMS_TEMPLATE_ID")
    sms_region: str = Field(default="ap-guangzhou", alias="SMS_REGION")
    sms_console_fallback_enabled: bool = Field(default=False, alias="SMS_CONSOLE_FALLBACK_ENABLED")

    # CORS
    cors_origins: str = Field(default="http://localhost:5173", alias="CORS_ORIGINS")

    # 验证码风控
    verification_code_length: int = Field(default=6, alias="VERIFICATION_CODE_LENGTH")
    verification_code_expire_minutes: int = Field(
        default=5, alias="VERIFICATION_CODE_EXPIRE_MINUTES"
    )
    verification_code_max_attempts: int = Field(default=5, alias="VERIFICATION_CODE_MAX_ATTEMPTS")
    verification_code_lockout_minutes: int = Field(
        default=10, alias="VERIFICATION_CODE_LOCKOUT_MINUTES"
    )
    verification_code_send_cooldown_seconds: int = Field(
        default=60, alias="VERIFICATION_CODE_SEND_COOLDOWN_SECONDS"
    )
    verification_code_send_window_minutes: int = Field(
        default=30, alias="VERIFICATION_CODE_SEND_WINDOW_MINUTES"
    )
    verification_code_max_sends_per_window: int = Field(
        default=5, alias="VERIFICATION_CODE_MAX_SENDS_PER_WINDOW"
    )

    # ==================== 计算属性 ====================

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS 来源列表"""
        return [o.strip() for o in self.cors_origins.split(",")]

    def get_database_url(self, *, sync_driver: str | None = None) -> str:
        """获取数据库连接串，并统一约束 PostgreSQL。"""
        database_url = self.database_url.strip()
        if not database_url:
            raise ValueError("必须设置 DATABASE_URL，且当前项目仅支持 PostgreSQL")
        if not database_url.startswith(("postgresql", "postgres")):
            raise ValueError(f"当前项目仅支持 PostgreSQL，收到: {database_url}")

        if sync_driver == "psycopg":
            return database_url.replace("+asyncpg", "+psycopg")
        if sync_driver == "plain":
            return database_url.replace("+asyncpg", "").replace("+psycopg", "")
        return database_url

    def get_masked_database_url(self) -> str:
        """返回脱敏后的数据库连接串，避免日志泄露凭据。"""
        raw_url = self.get_database_url()
        parsed = urlsplit(raw_url)
        hostname = parsed.hostname or ""
        if parsed.port:
            hostname = f"{hostname}:{parsed.port}"

        user = parsed.username or ""
        auth = ""
        if user:
            auth = f"{user}:***@"

        masked_netloc = f"{auth}{hostname}" if hostname else auth.rstrip("@")
        return urlunsplit(
            (parsed.scheme, masked_netloc, parsed.path, parsed.query, parsed.fragment)
        )

    # ==================== 便捷方法 ====================

    def get_llm_key(self, provider: str) -> str | None:
        """安全获取 LLM API Key"""
        key = getattr(self, f"{provider}_api_key", None)
        return key.get_secret_value() if key else None

    def get_jwt_secret(self) -> str:
        """获取 JWT 密钥（生产环境强制检查）"""
        secret = self.jwt_secret_key.get_secret_value()
        if self.is_production:
            if secret == "dev-secret-only":
                raise ValueError("生产环境必须设置 JWT_SECRET_KEY")
            if len(secret) < 32:
                raise ValueError("JWT_SECRET_KEY 长度必须 >= 32")
        return secret

    def init_langsmith(self) -> None:
        """初始化 LangSmith 追踪（在 lifespan 中调用）"""
        import logging
        import os

        logger = logging.getLogger(__name__)

        if not self.langchain_tracing_v2:
            logger.info("LangSmith 追踪未启用")
            return

        api_key = self.langchain_api_key.get_secret_value() if self.langchain_api_key else None
        if not api_key:
            logger.warning("LangSmith 已启用，但未设置 LANGCHAIN_API_KEY")
            return

        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = api_key
        os.environ["LANGCHAIN_PROJECT"] = self.langchain_project

        logger.info(f"LangSmith 追踪已启用 | 项目: {self.langchain_project}")

    def validate(self) -> bool:
        """验证配置完整性（在 lifespan 中调用）"""
        import logging

        logger = logging.getLogger(__name__)

        has_llm = any(
            [
                self.get_llm_key("deepseek"),
                self.get_llm_key("openai"),
                self.get_llm_key("anthropic"),
                self.get_llm_key("minimax"),
            ]
        )

        has_embedding = bool(self.silicon_api_key)

        if self.is_production:
            if not has_llm:
                logger.error("生产环境必须配置至少一个 LLM API Key")
                return False

            try:
                self.get_jwt_secret()
            except ValueError as e:
                logger.error(f"JWT 配置错误: {e}")
                return False

        try:
            self.get_database_url()
        except ValueError as e:
            logger.error(f"数据库配置错误: {e}")
            return False

        if self.langchain_tracing_v2 and not self.langchain_api_key:
            logger.warning("LangSmith 已启用但未设置 LANGCHAIN_API_KEY")

        return has_llm or has_embedding


@lru_cache
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()


# 全局导出 - 只定义，不初始化
settings = get_settings()
