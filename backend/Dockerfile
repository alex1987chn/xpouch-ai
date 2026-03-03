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
COPY main.py ./
COPY database.py ./
COPY models/ ./models/
COPY routers/ ./routers/
COPY services/ ./services/
COPY utils/ ./utils/
COPY event_types/ ./event_types/
COPY agents/ ./agents/
COPY crud/ ./crud/
COPY migrations/ ./migrations/
COPY alembic.ini ./

# 暴露端口（与 .env.example 和 docker-compose.yml 保持一致）
EXPOSE 3000

# 启动命令：先执行数据库迁移，再启动应用
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn main:app --host 0.0.0.0 --port 3000"]
