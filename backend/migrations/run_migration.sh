#!/bin/bash
# ============================================================================
# 数据库迁移执行脚本
# 自动读取 backend/.env 中的数据库配置并执行迁移
# ============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$BACKEND_DIR/.env"
MIGRATION_FILE="$SCRIPT_DIR/apply_all_migrations.sql"

echo "========================================"
echo "XPouch AI Database Migration Tool"
echo "========================================"
echo ""

# 检查迁移文件是否存在
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

# 检查 .env 文件是否存在
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: .env file not found: $ENV_FILE${NC}"
    echo "Please ensure backend/.env exists with database configuration."
    exit 1
fi

echo "Loading database configuration from $ENV_FILE..."

# 从 .env 文件读取配置
# 支持两种格式：
# 1. DATABASE_URL=postgresql+psycopg://user:pass@host:port/dbname
# 2. POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB 单独配置

# 尝试读取 DATABASE_URL
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' || echo "")

if [ -n "$DATABASE_URL" ]; then
    # 解析 DATABASE_URL
    # 格式: postgresql+psycopg://user:password@host:port/dbname
    
    # 提取用户名
    DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    # 提取密码
    DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    # 提取主机
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    # 提取端口
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    # 提取数据库名
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/[[:space:]]*\([^[:space:]]*\)[[:space:]]*$/\1/p')
else
    # 读取单独的配置
    DB_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' || echo "postgres")
    DB_PASS=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' || echo "")
    DB_NAME=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' || echo "xpouch")
    DB_HOST=$(grep -E '^DB_HOST=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' || echo "localhost")
    DB_PORT=$(grep -E '^DB_PORT=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' || echo "5432")
fi

# 验证配置
if [ -z "$DB_PASS" ]; then
    echo -e "${RED}Error: Database password not found in .env file${NC}"
    exit 1
fi

echo ""
echo "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# 检查 psql 是否安装
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql command not found${NC}"
    echo "Please install PostgreSQL client:"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
    echo "  CentOS/RHEL: sudo yum install postgresql"
    echo "  macOS: brew install libpq"
    exit 1
fi

# 测试连接
echo "Testing database connection..."
if ! PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to database${NC}"
    echo "Please check your database configuration in $ENV_FILE"
    exit 1
fi

echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# 执行迁移
echo "Executing migration: apply_all_migrations.sql"
echo "----------------------------------------"

if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Migration completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Pull latest code: git pull origin main"
    echo "  2. Restart your application"
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}Migration failed!${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
