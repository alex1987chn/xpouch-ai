#!/usr/bin/env bash
# ============================================================================
# XPouch AI 数据库定时备份脚本
#
# 用法（服务器上）：
#   ./scripts/backup_db.sh                    # 使用默认保留 7 份
#   BACKUP_KEEP=30 ./scripts/backup_db.sh     # 自定义保留份数
#
# crontab 示例（每天凌晨 3 点备份）：
#   0 3 * * * cd /path/to/xpouch-ai && ./scripts/backup_db.sh >> /var/log/xpouch_backup.log 2>&1
#
# 说明：
# - 备份写入 ./backups/（gitignored），文件名带时间戳
# - 超过 BACKUP_KEEP 份时按最旧优先轮转删除
# - 读取根目录 .env 的 POSTGRES_* 变量；容器名默认 xpouch-postgres
# ============================================================================
set -euo pipefail

KEEP="${BACKUP_KEEP:-7}"
CONTAINER="${POSTGRES_CONTAINER:-xpouch-postgres}"
BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-0}"  # 0 = 仅按份数轮转

mkdir -p "$BACKUP_DIR"

# 从根 .env 读取连接信息（不回显）
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
: "${POSTGRES_USER:?POSTGRES_USER 未设置（检查根目录 .env）}"
: "${POSTGRES_DB:?POSTGRES_DB 未设置（检查根目录 .env）}"

OUT_FILE="$BACKUP_DIR/xpouch_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

echo "[backup] dumping ${POSTGRES_DB} from container ${CONTAINER} ..."
docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$OUT_FILE"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "[backup] done: $OUT_FILE ($SIZE)"

# 轮转：按份数
ls -1t "$BACKUP_DIR"/xpouch_${POSTGRES_DB}_*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "[backup] rotating out: $old"
  rm -f "$old"
done

# 可选：按天数清理（BACKUP_RETENTION_DAYS > 0 时启用）
if [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -name "xpouch_${POSTGRES_DB}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
fi

echo "[backup] all done (keeping $KEEP copies)"
