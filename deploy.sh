#!/bin/bash

# XPouch AI 一键部署脚本
# 用法: ./deploy.sh
# 功能: 拉取最新代码并重新部署服务

set -e  # 遇到错误立即退出

echo "=========================================="
echo "🚀 XPouch AI 部署脚本"
echo "=========================================="

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 进入项目目录
cd /opt/xpouch-ai || {
    echo -e "${RED}❌ 错误: 无法进入 /opt/xpouch-ai 目录${NC}"
    exit 1
}

# 2. 检查必要的配置文件
echo -e "${YELLOW}🔍 检查配置文件...${NC}"

if [ ! -f ".env" ]; then
    echo -e "${RED}❌ 错误: 根目录 .env 不存在，请上传配置文件${NC}"
    exit 1
fi

if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ 错误: backend/.env 不存在，请上传配置文件${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 配置文件检查通过${NC}"

# 3. 拉取最新代码
echo -e "${YELLOW}📥 拉取最新代码...${NC}"
git fetch origin
git reset --hard origin/main
echo -e "${GREEN}✅ 代码已更新到最新版本: $(git rev-parse --short HEAD)${NC}"

# 4. 停止现有服务
echo -e "${YELLOW}🛑 停止现有服务...${NC}"
docker-compose down
echo -e "${GREEN}✅ 服务已停止${NC}"

# 5. 清理旧镜像（节省空间）
echo -e "${YELLOW}🧹 清理旧镜像...${NC}"
docker image prune -f
echo -e "${GREEN}✅ 旧镜像已清理${NC}"

# 6. 重新构建镜像
echo -e "${YELLOW}🔨 重新构建镜像...${NC}"
docker-compose build --no-cache
echo -e "${GREEN}✅ 镜像构建完成${NC}"

# 7. 启动服务
echo -e "${YELLOW}▶️  启动服务...${NC}"
docker-compose up -d
echo -e "${GREEN}✅ 服务已启动${NC}"

# 8. 等待服务启动
echo -e "${YELLOW}⏳ 等待服务初始化 (15秒)...${NC}"
sleep 15

# 9. 检查服务状态
echo -e "${YELLOW}🔍 检查服务状态...${NC}"
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ 所有服务运行正常${NC}"
else
    echo -e "${RED}⚠️  部分服务未启动，请检查日志${NC}"
fi

docker-compose ps

# 10. 检查后端健康状态
echo -e "${YELLOW}📋 后端服务日志 (最近20行):${NC}"
docker-compose logs --tail=20 backend || true

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 部署完成!${NC}"
echo "=========================================="
echo ""
echo "访问地址:"
echo "  - 前端: http://$(hostname -I | awk '{print $1}'):8080"
echo "  - 后端 API: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo "=========================================="
