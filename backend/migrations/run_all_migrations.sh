#!/bin/bash
# ============================================================================
# 统一数据库迁移脚本
# 自动执行所有迁移（业务表 + Checkpoint 表）
#
# 执行方式：
#   chmod +x run_all_migrations.sh
#   ./run_all_migrations.sh
# ============================================================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# 1. 检查环境变量
# ============================================================================
print_info "Checking environment..."

if [ -z "$DATABASE_URL" ]; then
    print_error "DATABASE_URL not set"
    print_info "Usage: DATABASE_URL=postgresql://user:pass@host:port/db ./run_all_migrations.sh"
    exit 1
fi

# 转换 DATABASE_URL 为 psycopg 格式
PSYCOPG_DATABASE_URL=$(echo "$DATABASE_URL" | sed 's/+asyncpg//' | sed 's/+psycopg//')
print_info "Database URL: $PSYCOPG_DATABASE_URL"

# ============================================================================
# 2. 执行业务表迁移
# ============================================================================
print_info ""
print_info "=========================================="
print_info "Step 1: Migrating Business Tables"
print_info "=========================================="

if [ -f "apply_all_migrations.sql" ]; then
    print_info "Running apply_all_migrations.sql..."
    psql "$PSYCOPG_DATABASE_URL" -f apply_all_migrations.sql
    print_info "✅ Business tables migration completed"
else
    print_warn "apply_all_migrations.sql not found, skipping..."
fi

# ============================================================================
# 3. 执行 Checkpoint 表迁移
# ============================================================================
print_info ""
print_info "=========================================="
print_info "Step 2: Migrating Checkpoint Tables"
print_info "=========================================="

if [ -f "checkpoint_tables.sql" ]; then
    print_info "Running checkpoint_tables.sql..."
    psql "$PSYCOPG_DATABASE_URL" -f checkpoint_tables.sql
    print_info "✅ Checkpoint tables migration completed"
else
    print_warn "checkpoint_tables.sql not found, skipping..."
fi

# ============================================================================
# 4. 验证迁移结果
# ============================================================================
print_info ""
print_info "=========================================="
print_info "Step 3: Verifying Migrations"
print_info "=========================================="

# 检查业务表
BUSINESS_TABLES=$(psql "$PSYCOPG_DATABASE_URL" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('thread', 'message', 'customagent', 'tasksession', 'subtask', 'artifact', 'user_memories');" \
    2>/dev/null | tr -d ' ')

if [ "$BUSINESS_TABLES" = "7" ]; then
    print_info "✅ All 7 business tables exist"
else
    print_warn "⚠️  Business tables count: $BUSINESS_TABLES (expected 7)"
fi

# 检查 Checkpoint 表
CHECKPOINT_TABLES=$(psql "$PSYCOPG_DATABASE_URL" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'checkpoint%';" \
    2>/dev/null | tr -d ' ')

if [ "$CHECKPOINT_TABLES" = "4" ]; then
    print_info "✅ All 4 checkpoint tables exist"
else
    print_warn "⚠️  Checkpoint tables count: $CHECKPOINT_TABLES (expected 4)"
fi

# ============================================================================
# 完成
# ============================================================================
print_info ""
print_info "=========================================="
print_info "✅ All migrations completed successfully!"
print_info "=========================================="
print_info ""
print_info "Business Tables: $BUSINESS_TABLES"
print_info "Checkpoint Tables: $CHECKPOINT_TABLES"
print_info ""
