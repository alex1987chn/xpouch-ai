# Database Migrations

数据库迁移脚本目录

## 推荐使用：统一迁移脚本

**`apply_all_migrations.sql`** - 包含所有 v3.0 迁移的统一脚本

特性：
- ✅ **幂等性**：可重复执行，已存在的表/字段/索引会自动跳过
- ✅ **兼容性**：PostgreSQL 13+
- ✅ **事务安全**：使用 `DO $$` 块确保原子性
- ✅ **无敏感信息**：纯 SQL 文件，可安全开源

### 执行方式（推荐）

#### 方式1：使用自动脚本（读取 .env 配置）

```bash
# Linux/macOS
chmod +x backend/migrations/run_migration.sh
backend/migrations/run_migration.sh
```

#### 方式2：手动执行（需要手动输入密码）

```bash
# 使用 psql 命令行
psql -h localhost -U postgres -d xpouch -f backend/migrations/apply_all_migrations.sql

# 在 Docker 中执行
docker exec -i your_postgres_container psql -U postgres -d xpouch < backend/migrations/apply_all_migrations.sql
```

### 验证迁移

```sql
-- 查看所有表结构
SELECT table_name, COUNT(*) as column_count 
FROM information_schema.columns 
WHERE table_name IN ('thread', 'message', 'customagent', 'tasksession', 'subtask', 'artifact')
GROUP BY table_name;

-- 查看迁移历史
SELECT * FROM migration_history;
```



---

## 主要字段变更清单

### Thread 表
- `agent_type` (VARCHAR) - 会话类型: default/custom/ai
- `agent_id` (VARCHAR) - 智能体ID
- `task_session_id` (VARCHAR) - 关联任务会话
- `status` (VARCHAR) - 状态: idle/running/paused
- `thread_mode` (VARCHAR) - 模式: simple/complex

### Message 表
- `extra_data` (JSONB) - 额外数据（thinking等）

### CustomAgent 表
- `is_default` (BOOLEAN) - 是否为默认助手

### TaskSession 表
- `plan_summary`, `estimated_steps`, `execution_mode`

### SubTask 表
- `task_description`, `output_result`, `started_at`, `completed_at`
- `sort_order`, `execution_mode`, `depends_on`, `error_message`, `duration_ms`

### Artifact 表（新建）
- 完整的产物独立表

---

## 部署流程

### 线上部署步骤

```bash
# 1. 停止应用服务（避免迁移过程中有写入）
docker stop xpouch-backend

# 2. 备份数据库（重要！）
docker exec your_postgres_container pg_dump -U postgres xpouch > backup_$(date +%Y%m%d_%H%M%S).sql

# 3. 拉取最新迁移脚本
git pull origin main

# 4. 执行数据库迁移
cd backend/migrations
chmod +x run_migration.sh
./run_migration.sh

# 5. 拉取完整代码并重启
git pull origin main
docker-compose up -d --build
```

### 注意事项

1. **敏感信息安全**
   - `backend/.env` 包含数据库密码、API Key 等敏感信息
   - 该文件已被 `.gitignore` 忽略，**不会提交到 GitHub**
   - 迁移脚本不会包含任何敏感信息

2. **迁移前必做**
   - 备份数据库
   - 停止应用服务
   - 确保 `.env` 文件配置正确

3. **迁移后验证**
   ```sql
   -- 检查迁移记录
   SELECT * FROM migration_history;
   
   -- 检查表结构
   SELECT table_name, column_name 
   FROM information_schema.columns 
   WHERE table_name IN ('thread', 'message', 'customagent', 'tasksession', 'subtask', 'artifact');
   ```
