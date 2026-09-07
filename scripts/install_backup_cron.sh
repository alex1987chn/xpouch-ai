#!/bin/bash

# 幂等安装数据库备份 crontab（每天 03:00 执行 backup_db.sh）
# 用法: ./scripts/install_backup_cron.sh   （在仓库根目录或任意位置执行均可）
# 卸载: crontab -l 找到 backup_db.sh 行删除，或 crontab -r 清空（慎用）

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${REPO_DIR}/backups"
CRON_LINE="0 3 * * * cd ${REPO_DIR} && ./scripts/backup_db.sh >> ${LOG_DIR}/backup_cron.log 2>&1"

mkdir -p "${LOG_DIR}"

if ! command -v crontab &>/dev/null; then
    echo "❌ 错误: 未找到 crontab 命令（请安装 cron/cronie）"
    exit 1
fi

# 幂等：已存在 backup_db 条目则跳过（避免重复叠加）
if crontab -l 2>/dev/null | grep -Fq "scripts/backup_db.sh"; then
    echo "ℹ️  已存在备份 crontab，跳过安装。当前条目:"
    crontab -l 2>/dev/null | grep -F "scripts/backup_db.sh" | sed 's/^/   /'
    exit 0
fi

(crontab -l 2>/dev/null; echo "${CRON_LINE}") | crontab -

echo "✅ 已安装备份 crontab（每天 03:00）:"
echo "   ${CRON_LINE}"
echo ""
echo "验证: crontab -l | grep backup_db"
echo "手动试跑一次: ./scripts/backup_db.sh"
