FROM python:3.12-slim

WORKDIR /app

# 设置环境变量，防止 Python 生成 .pyc 文件和缓冲输出
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 安装基础工具
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
# 注意：在构建镜像前，请确保在 backend 目录下生成了 requirements.txt
# 可以使用命令: uv pip compile pyproject.toml -o requirements.txt
COPY requirements.txt .

# 安装依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY . .

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
