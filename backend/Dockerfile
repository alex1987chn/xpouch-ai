FROM python:3.13-slim

WORKDIR /app

# 设置环境变量，防止 Python 生成 .pyc 文件和缓冲输出
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 安装 uv（推荐的 Python 包管理器）
# 使用 pip 安装 uv 更可靠
RUN pip install --no-cache-dir uv

# 复制依赖锁定文件和 pyproject.toml
COPY pyproject.toml uv.lock ./

# 使用 uv 安装依赖（更快更可靠）
# ✅ 这一层会被缓存，只有依赖变更时才会重新安装
RUN uv sync --frozen --no-dev

# 明确复制源代码（优化缓存）
# 只有以下目录变更时才会使后续层失效
COPY *.py ./
COPY *.yaml ./
COPY models/ ./models/
COPY schemas/ ./schemas/
COPY routers/ ./routers/
COPY services/ ./services/
COPY utils/ ./utils/
COPY event_types/ ./event_types/
COPY agents/ ./agents/
COPY crud/ ./crud/
COPY auth/ ./auth/
COPY tools/ ./tools/
COPY migrations/ ./migrations/
COPY alembic.ini ./

# 暴露端口（与 .env.example 和 docker-compose.yml 保持一致）
EXPOSE 3000

# 健康检查：应用级 /api/health（部署编排可另配更细粒度探针）
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=3).status==200 else 1)"

# 非 root 运行：镜像层创建专用用户并赋 .venv 所有权
RUN useradd --create-home --shell /bin/sh xpouch && chown -R xpouch:xpouch /app
USER xpouch

# 启动命令：先执行数据库迁移，再启动应用
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn main:app --host 0.0.0.0 --port 3000"]
