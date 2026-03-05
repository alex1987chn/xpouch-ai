# XPouch AI - Just 任务运行器
# 安装 just: https://github.com/casey/just
# Windows: winget install Casey.Just 或 cargo install just

# 设置默认 shell（跨平台）
set windows-shell := ["powershell.exe", "-c"]

# 显示可用命令（默认）
default:
    @just --list

# =============================================================================
# 开发环境
# =============================================================================

# 安装前后端依赖
install:
    cd frontend; pnpm install
    cd backend; uv sync

# 启动后端开发服务器（热重载）
backend:
    cd backend; uv run uvicorn main:app --reload --port 3002

# 启动前端开发服务器
frontend:
    cd frontend; pnpm dev

# =============================================================================
# 测试
# =============================================================================

# 运行后端测试
test-backend:
    cd backend; uv run pytest tests/ -v

# 运行前端测试
test-frontend:
    cd frontend; pnpm test

# 运行所有测试
test: test-backend test-frontend

# =============================================================================
# 代码检查
# =============================================================================

# 后端代码检查
lint-backend:
    cd backend; uv run ruff check .

# 后端自动修复
lint-backend-fix:
    cd backend; uv run ruff check . --fix

# 前端代码检查
lint-frontend:
    cd frontend; pnpm run lint

# 前端自动修复
lint-frontend-fix:
    cd frontend; pnpm run lint:fix

# 检查所有
lint: lint-backend lint-frontend

# 修复所有
lint-fix: lint-backend-fix lint-frontend-fix

# =============================================================================
# Pre-commit Hooks（本地提交前检查）
# =============================================================================

# 安装 pre-commit hooks（使用 uv）
install-hooks:
    uv tool install pre-commit
    pre-commit install
    @echo "Pre-commit hooks installed!"

# 手动运行 pre-commit 检查所有文件
pre-commit-check:
    pre-commit run --all-files

# 跳过 pre-commit 提交（紧急情况下使用）
commit-no-verify msg:
    git add -A
    git commit -m "{{msg}}" --no-verify

# =============================================================================
# 数据库
# =============================================================================

# 执行数据库迁移
migrate:
    cd backend; uv run alembic upgrade head

# 创建新迁移（需要传入描述参数）
migration msg:
    cd backend; uv run alembic revision --autogenerate -m "{{msg}}"

# =============================================================================
# Docker
# =============================================================================

# Docker 开发模式启动
docker:
    docker-compose up -d --build

# Docker 停止
docker-down:
    docker-compose down

# Docker 完全重建
docker-rebuild:
    docker-compose down -v
    docker-compose up -d --build

# =============================================================================
# 清理
# =============================================================================

# 清理缓存文件（跨平台）
clean:
    # PowerShell 命令清理 Python 缓存
    Get-ChildItem -Path . -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path . -Recurse -Directory -Filter ".ruff_cache" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path . -Recurse -File -Filter "*.pyc" | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "Cache cleaned!"

# =============================================================================
# 快捷命令
# =============================================================================

# 快速提交（示例：just commit "fix: 修复 bug"）
commit msg:
    git add -A
    git commit -m "{{msg}}"

# 推送当前分支
push:
    git push
