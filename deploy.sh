#!/bin/bash

# XPouch AI 部署脚本 (v2.0 - with Alembic)
# 使用方式: 通过SFTP上传到服务器后执行

set -e

echo "=== XPouch AI 部署脚本 ==="

# 检查环境文件
if [ ! -f ".env" ]; then
    echo "❌ 错误: 根目录 .env 文件不存在"
    exit 1
fi

# 确保 backend/.env 存在（docker-compose 需要）
if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env 不存在，从根目录复制..."
    cp .env backend/.env
fi

echo "1. 拉取最新代码..."
git fetch origin
git reset --hard origin/main

echo "2. 停止现有服务..."
docker-compose down

echo "3. 构建并启动容器..."
# 检查是否有依赖变更（可选优化）
if [ -f "backend/uv.lock" ] && [ -f "backend/pyproject.toml" ]; then
    echo "   使用缓存构建（依赖未变更）..."
    docker-compose build
else
    echo "   使用 --no-cache 构建（首次或依赖变更）..."
    docker-compose build --no-cache
fi

docker-compose up -d

echo "4. 等待数据库就绪..."
sleep 5

echo "5. 检查 Alembic 状态..."
# 检查是否需要标记初始状态（仅首次部署需要）
if ! docker-compose exec -T backend uv run alembic current 2>/dev/null | grep -q "001"; then
    echo "   📝 首次部署：标记数据库状态..."
    docker-compose exec -T backend uv run alembic stamp head || true
else
    echo "   ✅ Alembic 状态正常"
fi

echo "6. 执行数据库迁移（如有变更）..."
docker-compose exec -T backend uv run alembic upgrade head

echo "7. 检查服务状态..."
docker-compose ps

echo "8. 清理旧镜像..."
docker image prune -f

echo ""
echo "=== ✅ 部署完成 ==="
echo ""
echo "访问地址:"
echo "  - 前端: https://xpouch.ai"
echo "  - 后端: https://xpouch.ai/api/health"
echo ""
echo "查看日志:"
echo "  docker-compose logs -f backend"
echo "  docker-compose logs -f frontend"
