# Database Migrations

数据库迁移脚本目录

## 迁移脚本列表

### 1. `apply_all_migrations.sql` - 业务表迁移
包含所有业务表的 v3.0 迁移：
- Thread 表扩展（agent_type, agent_id, task_session_id, status, thread_mode）
- Message 表扩展（extra_data）
- CustomAgent 表扩展（is_default, category, is_public, conversation_count）
- TaskSession 表扩展（plan_summary, estimated_steps, execution_mode, status, completed_at）
- SubTask 表扩展（task_description, output_result, started_at, completed_at, sort_order, execution_mode, depends_on, error_message, duration_ms）
- Artifact 表（新建）
- UserMemory 表（新建，支持向量检索）
- SystemExpert 表扩展（description, is_dynamic）

**特性：**
- ✅ **幂等性**：可重复执行，已存在的表/字段/索引会自动跳过
- ✅ **兼容性**：PostgreSQL 13+
- ✅ **事务安全**：使用 `DO $$` 块确保原子性
- ✅ **无敏感信息**：纯 SQL 文件，可安全开源

### 2. `checkpoint_tables.sql` - LangGraph Checkpoint 表迁移
包含 LangGraph 复杂模式所需的检查点表：
- `checkpoints` - 工作流状态快照
- `checkpoint_blobs` - 二进制大对象存储
- `checkpoint_writes` - 写入操作记录
- `checkpoint_migrations` - 迁移版本记录

**特性：**
- ✅ **幂等性**：可重复执行
- ✅ **兼容性**：PostgreSQL 13+
- ✅ **LangGraph 标准**：完全符合 `langgraph-checkpoint-postgres` 官方 Schema

### 3. `run_all_migrations.sh` - 统一迁移执行脚本
自动执行所有迁移（业务表 + Checkpoint 表）的统一脚本

---

## 执行方式

### 方式1：使用统一迁移脚本（推荐）

```bash
cd backend/migrations
chmod +x run_all_migrations.sh
./run_all_migrations.sh
```

#### Docker 环境

```bash
# 在 Docker 容器中执行（使用环境变量）
docker exec -i ${POSTGRES_CONTAINER:-xpouch-postgres} psql -U ${POSTGRES_USER:-xpouch_admin} -d ${POSTGRES_DB:-xpouch_ai} < backend/migrations/apply_all_migrations.sql
docker exec -i ${POSTGRES_CONTAINER:-xpouch-postgres} psql -U ${POSTGRES_USER:-xpouch_admin} -d ${POSTGRES_DB:-xpouch_ai} < backend/migrations/checkpoint_tables.sql
```

### 方式2：单独执行迁移

```bash
# 只执行业务表迁移（使用环境变量）
psql -h localhost -U ${POSTGRES_USER:-xpouch_admin} -d ${POSTGRES_DB:-xpouch_ai} -f backend/migrations/apply_all_migrations.sql

# 只执行 Checkpoint 表迁移
psql -h localhost -U ${POSTGRES_USER:-xpouch_admin} -d ${POSTGRES_DB:-xpouch_ai} -f backend/migrations/checkpoint_tables.sql
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

### 本地开发环境（Linux/macOS）

```bash
cd backend/migrations
chmod +x run_all_migrations.sh
./run_all_migrations.sh
```

### Docker 部署（生产环境）

```bash
# 1. 停止应用服务（可选，迁移是幂等的）
docker stop xpouch-backend

# 2. 备份数据库（重要！）
docker exec ${POSTGRES_CONTAINER:-xpouch-postgres} pg_dump -U ${POSTGRES_USER:-xpouch_admin} ${POSTGRES_DB:-xpouch_ai} > backup_$(date +%Y%m%d_%H%M%S).sql

# 3. 拉取最新代码
git pull origin main

# 4. 执行数据库迁移（在 Postgres 容器中）
docker exec -i ${POSTGRES_CONTAINER:-xpouch-postgres} psql -U ${POSTGRES_USER:-xpouch_admin} -d ${POSTGRES_DB:-xpouch_ai} < backend/migrations/apply_all_migrations.sql
docker exec -i ${POSTGRES_CONTAINER:-xpouch-postgres} psql -U ${POSTGRES_USER:-xpouch_admin} -d ${POSTGRES_DB:-xpouch_ai} < backend/migrations/checkpoint_tables.sql

# 5. 重启服务（带重建）
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
