# Database Migrations

数据库迁移脚本目录

## 推荐使用：统一迁移脚本

**`apply_all_migrations.sql`** - 包含所有 v3.0 迁移的统一脚本

特性：
- ✅ **幂等性**：可重复执行，已存在的表/字段/索引会自动跳过
- ✅ **兼容性**：PostgreSQL 13+
- ✅ **事务安全**：使用 `DO $$` 块确保原子性

### 执行方式（推荐）

```bash
# 方式1：使用 psql 命令行
psql -h localhost -U postgres -d xpouch -f backend/migrations/apply_all_migrations.sql

# 方式2：在 Docker 中执行
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

## 备用：单独迁移文件

如果需要单独执行某个迁移，可以使用以下文件：

### 1. v3_0_complex_mode_refactor.sql
**v3.0 复杂模式重构**

- 创建 `artifact` 表（产物独立表）
- 扩展 `tasksession` 表（plan_summary, estimated_steps, execution_mode）
- 扩展 `subtask` 表（task_description, output_result, started_at, completed_at, sort_order, execution_mode, depends_on, error_message, duration_ms）

### 2. add_message_metadata.sql
**添加 Message 表 extra_data 字段**

- 添加 `extra_data` JSONB 字段到 `message` 表
- 用于存储 thinking, reasoning 等额外信息

### 3. v3_0_1_thread_fields.sql
**v3.0.1 Thread 表字段扩展**

- 添加 `agent_type`, `agent_id`, `task_session_id`, `status`, `thread_mode` 字段
- 添加 `is_default` 字段到 `customagent` 表

---

## Python 迁移工具（可选）

如果需要更复杂的迁移逻辑，可以使用 `apply_migrations.py`：

```bash
# 查看状态
python backend/migrations/apply_migrations.py status

# 执行所有迁移
python backend/migrations/apply_migrations.py apply
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
