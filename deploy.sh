#!/bin/bash

# XPouch AI 部署脚本 (v2.2 - PG 18 support, docker compose)
# 使用方式: 通过SFTP上传到服务器后执行
# 支持场景: 首次使用 Alembic 或已有 Alembic 的历史项目

set -e

echo "=== XPouch AI 部署脚本 ==="

# 检查环境文件
if [ ! -f ".env" ]; then
    echo "❌ 错误: 根目录 .env 文件不存在"
    exit 1
fi

# 加载根目录环境变量，供部署脚本复用（数据库用户/库名等）
set -a
. ./.env
set +a

if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_PASSWORD" ]; then
    echo "❌ 错误: .env 缺少 POSTGRES_USER、POSTGRES_DB 或 POSTGRES_PASSWORD"
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

# 发版前置检查（v3.4.3 起 config fail-closed，漏配会在升级后表现为功能异常/无法登录）
echo "   发版前置检查..."
ENV_LINE=$(grep -E "^ENVIRONMENT=(production|development|testing)[[:space:]]*$" backend/.env | head -1 || true)
if [ -z "$ENV_LINE" ]; then
    echo "❌ 错误: backend/.env 未显式设置 ENVIRONMENT"
    echo "   v3.4.3 起 fail-closed：未设置按 production 处理（debug 端点与认证旁路关闭）。"
    echo "   请在 backend/.env 显式添加一行: ENVIRONMENT=production"
    exit 1
fi
ENV_VALUE=$(echo "$ENV_LINE" | cut -d= -f2 | tr -d '[:space:]')
echo "   ✅ ENVIRONMENT=$ENV_VALUE"

if [ "$ENV_VALUE" = "production" ]; then
    JWT_VALUE=$(grep -E "^JWT_SECRET_KEY=" backend/.env | head -1 | cut -d= -f2- | tr -d '[:space:]' | tr -d '"')
    if [ -z "$JWT_VALUE" ] \
        || [ "$JWT_VALUE" = "your-jwt-secret-key-change-in-production" ] \
        || [ "$JWT_VALUE" = "dev-secret-only" ]; then
        echo "❌ 错误: production 下 JWT_SECRET_KEY 未设置或仍为默认值，升级后将无法登录"
        echo "   生成强密钥: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        exit 1
    fi
    JWT_LEN=$(printf '%s' "$JWT_VALUE" | wc -c)
    if [ "$JWT_LEN" -lt 32 ]; then
        echo "❌ 错误: JWT_SECRET_KEY 长度 ${JWT_LEN} < 32，production 校验将拒绝登录"
        echo "   生成强密钥: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        exit 1
    fi
    echo "   ✅ JWT_SECRET_KEY 长度 ${JWT_LEN} >= 32"
fi

echo "2. 停止现有服务..."
# 检查是否需要数据库升级（PG 15 -> 18）
PG_UPGRADE_NEEDED=false
# 检测 docker compose 命令
# 优先使用 docker-compose（Ubuntu 生产环境默认）
# 如果 docker-compose 不存在，则尝试 docker compose（新版 Docker）
if command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ 错误: 未找到 docker-compose 或 docker compose 命令"
    exit 1
fi
echo "   使用命令: $DOCKER_COMPOSE"

# 检查是否需要升级
# 首先检查数据目录中的 PG 版本
if [ -f "postgres_data/PG_VERSION" ]; then
    DATA_PG_VERSION=$(cat postgres_data/PG_VERSION)
    echo "   检测到数据目录 PostgreSQL 版本: $DATA_PG_VERSION"
    
    if [ "$DATA_PG_VERSION" = "15" ]; then
        echo "   ⚠️  需要从 PostgreSQL 15 升级到 18"
        PG_UPGRADE_NEEDED=true
        
        # 尝试用 PG15 镜像启动临时容器来备份
        echo "   💾 正在启动 PG15 临时容器进行备份..."
        docker run --rm -d \
            --name pg15-backup-temp \
            -v "$(pwd)/postgres_data:/var/lib/postgresql/data" \
            -e POSTGRES_USER="$POSTGRES_USER" \
            -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
            -e POSTGRES_DB="$POSTGRES_DB" \
            pgvector/pgvector:pg15-bookworm
        
        # 等待 PG15 启动
        echo "   ⏳ 等待 PG15 容器就绪..."
        sleep 10
        
        # 检查容器是否健康
        if docker ps | grep -q "pg15-backup-temp"; then
            BACKUP_FILENAME="backup_pg15_$(date +%Y%m%d_%H%M%S).sql"
            echo "   💾 正在备份数据库到 $BACKUP_FILENAME..."
            docker exec pg15-backup-temp pg_dumpall -U "$POSTGRES_USER" > "$BACKUP_FILENAME"
            
            if [ $? -eq 0 ] && [ -s "$BACKUP_FILENAME" ]; then
                echo "   ✅ 备份完成: $(du -h "$BACKUP_FILENAME" | cut -f1)"
            else
                echo "❌ 备份失败"
                docker stop pg15-backup-temp
                exit 1
            fi
            docker stop pg15-backup-temp
        else
            echo "❌ PG15 临时容器启动失败"
            exit 1
        fi
    fi
elif docker ps --format "{{.Names}}\t{{.Status}}" | grep -q "xpouch-postgres.*Up.*healthy"; then
    # 如果数据目录没有 PG_VERSION，但容器在运行，尝试从容器检测
    CURRENT_PG=$(docker exec xpouch-postgres psql -U "$POSTGRES_USER" -c "SELECT current_setting('server_version');" 2>/dev/null | grep -oE "^1[5678]" | head -1 || echo "unknown")
    if [ "$CURRENT_PG" = "15" ]; then
        echo "   ⚠️  检测到 PostgreSQL 15，需要升级到 18"
        PG_UPGRADE_NEEDED=true
        BACKUP_FILENAME="backup_pg15_$(date +%Y%m%d_%H%M%S).sql"
        echo "   💾 正在备份数据库到 $BACKUP_FILENAME..."
        docker exec xpouch-postgres pg_dumpall -U "$POSTGRES_USER" > "$BACKUP_FILENAME"
        if [ $? -eq 0 ] && [ -s "$BACKUP_FILENAME" ]; then
            echo "   ✅ 备份完成: $(du -h "$BACKUP_FILENAME" | cut -f1)"
        else
            echo "❌ 备份失败，中止升级"
            exit 1
        fi
    fi
fi
$DOCKER_COMPOSE down

echo "3. 构建并启动容器..."
# 始终使用 --no-cache 确保代码变更被应用
# 注意：Docker 的 COPY 层缓存可能不会正确检测所有文件变化
echo "   使用 --no-cache 构建确保代码更新..."
$DOCKER_COMPOSE build --no-cache

# 如果需要 PG 升级，在启动前清理旧数据
PG_DATA_BACKUP_DIR=""
if [ "$PG_UPGRADE_NEEDED" = true ]; then
    echo "   🧹 清理 PG 15 数据，准备升级..."
    PG_DATA_BACKUP_DIR="postgres_data_pg15_backup_$(date +%Y%m%d)"
    mv postgres_data "$PG_DATA_BACKUP_DIR"
    echo "   ✅ 旧数据已备份到: $PG_DATA_BACKUP_DIR"
fi

$DOCKER_COMPOSE up -d

echo "4. 等待数据库就绪..."

# 如果需要 PG 升级，等待后恢复数据
if [ "$PG_UPGRADE_NEEDED" = true ]; then
    echo "   ⏳ 等待 PG 18 初始化..."
    sleep 10
    
    # 找到备份文件
    BACKUP_FILE=$(ls -t backup_pg15_*.sql 2>/dev/null | head -1)
    if [ -n "$BACKUP_FILE" ]; then
        echo "   📥 恢复数据到 PG 18..."
        # 等待数据库完全就绪
        sleep 5
        docker exec -i xpouch-postgres psql -U "$POSTGRES_USER" < "$BACKUP_FILE"
        if [ $? -eq 0 ]; then
            echo "   ✅ 数据恢复完成"
            # 可选：清理备份文件（注释掉以保留）
            # rm -f "$BACKUP_FILE"
            # echo "   🧹 已清理备份文件: $BACKUP_FILE"
        else
            echo "❌ 数据恢复失败，备份文件保留在: $BACKUP_FILE"
            exit 1
        fi
    else
        echo "   ⚠️  未找到备份文件，跳过恢复"
    fi
fi

# ⚠️ 注意：如果 user_memories 表已有数据，请先手动备份数据库再执行迁移！
# 备份命令: docker-compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%Y%m%d).sql
sleep 5

# 检查数据库连接是否正常
MAX_RETRY=5
RETRY=0
while ! $DOCKER_COMPOSE exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" 2>/dev/null; do
    RETRY=$((RETRY+1))
    if [ $RETRY -ge $MAX_RETRY ]; then
        echo "❌ 数据库连接失败，请检查数据库状态"
        exit 1
    fi
    echo "   等待数据库... ($RETRY/$MAX_RETRY)"
    sleep 3
done

echo "5. 检查 Alembic 状态..."

# 检查 alembic_version 表是否存在
TABLE_EXISTS=$(docker-compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'alembic_version');" 2>/dev/null | xargs || echo "f")

if [ "$TABLE_EXISTS" = "f" ] || [ -z "$TABLE_EXISTS" ]; then
    echo "   📝 首次使用 Alembic：标记现有数据库状态为 001..."
    # 标记现有数据库为 001 版本（不执行实际迁移，只记录状态）
    $DOCKER_COMPOSE exec -T backend uv run alembic stamp 001 || {
        echo "⚠️  stamp 失败，尝试强制标记..."
        $DOCKER_COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY); INSERT INTO alembic_version (version_num) VALUES ('001') ON CONFLICT DO NOTHING;"
    }
else
    echo "   ✅ Alembic 表已存在，检查当前版本..."
    CURRENT=$(docker-compose exec -T backend uv run alembic current 2>/dev/null | grep -E "^\w+" | head -1 | tr -d ' ' || echo "none")
    if [ "$CURRENT" = "none" ] || [ -z "$CURRENT" ]; then
        echo "   📝 表存在但无版本记录，标记为 001..."
        $DOCKER_COMPOSE exec -T backend uv run alembic stamp 001 || true
    else
        echo "   ✅ 当前版本: $CURRENT"
    fi
fi

echo "6. 执行数据库迁移（如有变更）..."
$DOCKER_COMPOSE exec -T backend uv run alembic upgrade head
if [ $? -eq 0 ]; then
    echo "   ✅ 迁移成功"
else
    echo "❌ 迁移失败，查看日志..."
    $DOCKER_COMPOSE exec -T backend uv run alembic history --verbose
    exit 1
fi

echo "7. 验证数据库修复..."
# 检查关键修复是否生效
EMBEDDING_TYPE=$($DOCKER_COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT data_type FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'embedding';" 2>/dev/null | xargs || echo "unknown")
if [ "$EMBEDDING_TYPE" = "USER-DEFINED" ]; then
    echo "   ✅ embedding 字段已修复为 Vector 类型"
else
    echo "   ⚠️  embedding 字段类型: $EMBEDDING_TYPE (可能未完全修复)"
fi

TRIGGER_COUNT=$($DOCKER_COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE 'trg_%_updated_at';" 2>/dev/null | xargs || echo "0")
echo "   ✅ 自动更新触发器: $TRIGGER_COUNT 个"

echo "8. 检查服务状态..."
$DOCKER_COMPOSE ps

echo "9. 清理旧镜像与缓存..."

# 9.1 清理悬空镜像（无标签的构建中间层）
echo "   清理悬空镜像..."
docker image prune -f

# 9.2 清理 xpouch 项目的旧版本镜像（保留最近2个版本）
echo "   清理 xpouch 旧版本镜像（保留最近2个）..."
# 获取所有 xpouch 相关镜像，按创建时间排序，删除除了最近2个之外的
docker images --format "{{.Repository}}:{{.Tag}}|{{.ID}}|{{.CreatedAt}}" \
  | grep -E "(xpouch|backend|frontend)" \
  | grep -v "<none>" \
  | sort -t'|' -k3 -r \
  | tail -n +3 \
  | cut -d'|' -f2 \
  | xargs -r docker rmi -f 2>/dev/null || echo "   无需清理旧版本镜像"

# 9.3 可选：清理构建缓存（取消注释以启用，会减慢下次构建但释放更多空间）
# echo "   清理构建缓存..."
# docker builder prune -f

echo ""
echo "=== ✅ 部署完成 ==="

# PG 升级后提示清理旧数据
if [ "$PG_UPGRADE_NEEDED" = true ] && [ -n "$PG_DATA_BACKUP_DIR" ]; then
    echo ""
    echo "📋 PostgreSQL 升级完成后的清理提示:"
    echo "   旧数据备份目录: $PG_DATA_BACKUP_DIR"
    echo "   旧 SQL 备份文件: $BACKUP_FILE"
    echo "   确认系统运行正常后，可手动删除:"
    echo "     rm -rf $PG_DATA_BACKUP_DIR"
    echo "     rm -f $BACKUP_FILE"
fi

echo ""
echo "当前 Alembic 版本:"
$DOCKER_COMPOSE exec -T backend uv run alembic current 2>/dev/null || echo "无法获取版本"
echo ""
echo "访问地址:"
echo "  - 前端: https://xpouch.ai"
echo "  - 后端: https://xpouch.ai/api/health"
echo ""
echo "查看日志:"
echo "  docker-compose logs -f backend"
echo "  docker-compose logs -f frontend"
echo ""
echo "回滚命令（如需要）:"
echo "  docker-compose exec backend uv run alembic downgrade 001"
