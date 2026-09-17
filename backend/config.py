"""
XPouch AI 配置管理 - Pydantic Settings 最佳实践

用法：
    from config import settings
    port = settings.port

安全：
    - 敏感信息使用 SecretStr，打印时自动脱敏
    - 生产环境强制验证（至少一个可用模型提供商 + JWT 密钥 + 数据库连接）

注意：
    - 本模块只定义配置，不执行初始化（避免循环导入）
    - 初始化在 main.py lifespan 中执行
    - **模型提供商的 API Key 不经过本模块**：变量名声明在 providers.yaml 的 env_key，
      取值由 providers_config.get_provider_api_key 直接 os.getenv——那是唯一入口，
      本模块不再为每个 provider 各留一个字段（曾经留过 7 个，且 validate() 里的
      provider 名单与 providers.yaml 不同步，见 validate() 注释）
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
    # 版本号**不在这里配置**：唯一真相源是 `pyproject.toml`，运行时值见
    # utils/version.py 的 APP_VERSION。此前它是本类的 VERSION 字段，与 pyproject
    # 各存一份，导致管理台「系统状态」连续两个版本显示旧值。
    # Fail-closed：必须显式声明环境。未配置 ENVIRONMENT 时启动即报错，
    # 防止生产漏配时静默落入 development（debug 端点开放、X-User-ID 认证旁路）。
    environment: Literal["development", "testing", "production"] = Field(
        default="production", alias="ENVIRONMENT"
    )
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

    # 认证（单一来源：utils/jwt_handler 从这里取值）
    jwt_secret_key: SecretStr = Field(default=SecretStr("dev-secret-only"), alias="JWT_SECRET_KEY")
    access_token_expire_minutes: int = Field(default=60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=60, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    # LangSmith
    langchain_tracing_v2: bool = Field(default=False, alias="LANGCHAIN_TRACING_V2")
    langchain_api_key: SecretStr | None = Field(default=None, alias="LANGCHAIN_API_KEY")
    langchain_project: str = Field(default="xpouch-ai", alias="LANGCHAIN_PROJECT")

    # 工具配置（模型提供商的 Key 不在此处，见模块注释）
    tavily_api_key: SecretStr | None = Field(default=None, alias="TAVILY_API_KEY")

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
    # 图内并行执行的任务数上限。
    #   1（默认）= 串行 —— 并行能力在位但不改变现有行为；
    #   >1 = 同层就绪任务并发执行（判定见 agents/plan_waves.py，扇出见
    #        agents/nodes/wave_scheduler.py: route_wave）。
    # 这是**env 兜底值**：实际生效值由 services/run_concurrency.py 解析
    # （system_setting 表的 graph_max_concurrency 优先，其次本值，最后串行）。
    # 管理端「系统状态」页可改，上限 MAX_CONCURRENCY_LIMIT。
    graph_max_concurrency: int = Field(default=1, alias="GRAPH_MAX_CONCURRENCY")
    # 单次 LLM 调用的超时（秒）。防模型端悬挂时无限 await——此前只能等 run 级
    # deadline 或后台清理兜底才发现，用户侧表现为「一直转圈」。
    # 用在哪：
    #   - generic（专家执行）：节点内 asyncio.timeout 包裹 → 按**任务级**失败处理
    #     （该任务失败、其余继续）
    #   - commander / aggregator：图节点级 TimeoutPolicy → 这两个挂了整轮无救，
    #     故快速失败并报清晰错误
    # 取值需显著大于正常单次调用耗时（专家长回答可达数分钟），又要小于 run 级
    # 执行预算（RUN_DEADLINE_SECONDS，默认 900s），否则超时形同虚设。
    llm_call_timeout_seconds: float = Field(default=420.0, alias="LLM_CALL_TIMEOUT_SECONDS")
    run_deadline_seconds: int = Field(default=900, alias="RUN_DEADLINE_SECONDS")
    # 注：原 run_max_graph_loops / RUN_MAX_GRAPH_LOOPS（图循环预算）已随批次 B3
    # 移除——它唯一的作用是看管「为对抗 interrupt_before 静态中断而手写的外层
    # while 循环」。改用 interrupt() 后，循环保护由原生 recursion_limit 承担。

    # 模型与工具（原散落 os.getenv 的外飞地收编，语义与默认值保持不变）
    model_name: str = Field(default="deepseek-flash", alias="MODEL_NAME")
    enable_tool_calling: bool = Field(default=True, alias="ENABLE_TOOL_CALLING")
    mcp_servers: str | None = Field(default=None, alias="MCP_SERVERS")
    force_model_fallback: bool = Field(default=False, alias="FORCE_MODEL_FALLBACK")
    allow_openai_models: bool = Field(default=False, alias="ALLOW_OPENAI_MODELS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_format: str = Field(default="text", alias="LOG_FORMAT")

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
    # 密码登录防爆破：同一 identifier 在窗口内的最大失败次数（内存限流，重启清零；
    # 叠加 bcrypt 成本后对在线爆破已足够，持久化锁定待引入集中式限流时再做）
    password_max_attempts: int = Field(default=10, alias="PASSWORD_MAX_ATTEMPTS")
    password_attempt_window_minutes: int = Field(default=5, alias="PASSWORD_ATTEMPT_WINDOW_MINUTES")
    # 发码 IP 频控：同一 IP 在窗口内的最大成功发码次数（内存限流；公共注册站
    # 的短信成本止损，私有部署可调大或设 0 关闭——0/负值表示不限制）
    sms_ip_max_sends_per_hour: int = Field(default=10, alias="SMS_IP_MAX_SENDS_PER_HOUR")
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
        """验证配置完整性（在 lifespan 中调用；生产环境返回 False 会拒绝启动）

        "至少有一个可用提供商"由 providers.yaml 推导（enabled 且对应 env_key 已设置，
        判定逻辑在 providers_config），不在此硬编码名单——此处曾写死
        deepseek/openai/anthropic/minimax 四个，漏掉 moonshot，且把已停用的 minimax
        算作可用：**只配 Moonshot 的生产实例会被判成"没有 LLM"而在启动时 RuntimeError**。
        名单的第二份拷贝就是漂移来源，故改为向真相源查询。

        放行口径与历史一致：LLM 提供商（providers 段）或向量模型（embeddings 段）
        至少配好一个即可（原实现是 `has_llm or has_embedding`）。此处刻意不放严——
        闸门收紧意味着既有部署可能直接起不来，那不该由一次重构顺手决定。
        """
        import logging
        import os

        from providers_config import (
            get_default_embedding_provider,
            get_embedding_provider_config,
            validate_all_providers,
        )

        logger = logging.getLogger(__name__)

        has_provider = bool(validate_all_providers()["configured"])
        if not has_provider:
            embedding_cfg = get_embedding_provider_config(get_default_embedding_provider()) or {}
            embedding_env_key = embedding_cfg.get("env_key")
            has_provider = bool(embedding_env_key and os.getenv(embedding_env_key))

        if self.is_production:
            if not has_provider:
                logger.error(
                    "生产环境必须至少配置一个可用的模型提供商"
                    "（providers.yaml 中 enabled 且对应 API Key 已设置）"
                )
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

        return has_provider


@lru_cache
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()


# 全局导出 - 只定义，不初始化
settings = get_settings()
