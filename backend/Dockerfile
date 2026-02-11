FROM python:3.13-slim

WORKDIR /app

# 设置环境变量，防止 Python 生成 .pyc 文件和缓冲输出
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 安装 uv（推荐的 Python 包管理器）
RUN apt-get update && apt-get install -y curl && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.local/bin:${PATH}"

# 复制依赖锁定文件和 pyproject.toml
COPY pyproject.toml uv.lock ./

# 使用 uv 安装依赖（更快更可靠）
RUN uv sync --frozen --no-dev

# 复制源码
COPY . .

# 暴露端口（与 .env.example 和 docker-compose.yml 保持一致）
EXPOSE 3000

# 启动命令
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
