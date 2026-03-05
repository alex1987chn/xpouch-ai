# XPouch AI - 开发任务自动化
.PHONY: help install dev backend frontend test lint clean docker

# 默认显示帮助
help:
	@echo "XPouch AI 开发命令"
	@echo "=================="
	@echo "  make install    - 安装前后端依赖"
	@echo "  make dev        - 启动开发环境（前后端同时）"
	@echo "  make backend    - 仅启动后端"
	@echo "  make frontend   - 仅启动前端"
	@echo "  make test       - 运行测试"
	@echo "  make lint       - 代码检查（前后端）"
	@echo "  make lint-fix   - 自动修复代码问题"
	@echo "  make migrate    - 执行数据库迁移"
	@echo "  make docker     - Docker 部署"
	@echo "  make clean      - 清理缓存文件"

# 安装依赖
install:
	cd frontend && pnpm install
	cd backend && uv sync

# 开发模式（使用 concurrently 或手动开两个终端）
dev:
	@echo "请开两个终端分别执行:"
	@echo "  make backend"
	@echo "  make frontend"

# 后端开发
backend:
	cd backend && uv run uvicorn main:app --reload --port 3002

# 前端开发
frontend:
	cd frontend && pnpm dev

# 测试
test:
	cd backend && uv run pytest tests/ -v
	cd frontend && pnpm test

# 代码检查
lint:
	cd backend && uv run ruff check .
	cd frontend && pnpm run lint

# 自动修复
lint-fix:
	cd backend && uv run ruff check . --fix
	cd frontend && pnpm run lint:fix

# 数据库迁移
migrate:
	cd backend && uv run alembic upgrade head

# 生成迁移（修改模型后执行）
migration:
	@read -p "迁移描述: " msg; \
	cd backend && uv run alembic revision --autogenerate -m "$$msg"

# Docker 部署
docker:
	docker-compose up -d --build

# 清理缓存
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
