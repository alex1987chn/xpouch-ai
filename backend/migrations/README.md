# Database Migrations

数据库迁移脚本目录

## 快速开始

使用迁移脚本自动执行所有迁移：

```bash
# 查看迁移状态
python backend/migrations/apply_migrations.py status

# 执行所有待执行的迁移
python backend/migrations/apply_migrations.py apply

# 回滚指定迁移（仅删除记录，不删除表结构）
python backend/migrations/apply_migrations.py rollback --file v3_0_1_thread_fields.sql
```

## 环境变量配置

确保设置以下环境变量（在 `.env` 文件中）：

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=xpouch
DB_USER=postgres
DB_PASSWORD=your_password
```

## 迁移文件列表

### 1. v3_0_complex_mode_refactor.sql
**v3.0 复杂模式重构**

- 创建 `artifact` 表（产物独立表）
- 扩展 `tasksession` 表（添加 plan_summary, estimated_steps, execution_mode）
- 扩展 `subtask` 表（添加 task_description, output_result, started_at, completed_at, sort_order, execution_mode, depends_on, error_message, duration_ms）
- 数据迁移：将 SubTask.artifacts JSON 字段迁移到 Artifact 表

**执行：**
```bash
python backend/migrations/apply_migrations.py apply
```

### 2. add_message_metadata.sql
**添加 Message 表 extra_data 字段**

- 添加 `extra_data` JSONB 字段到 `message` 表
- 用于存储 thinking, reasoning 等额外信息
- 注意：不能使用 `metadata` 作为字段名（SQLAlchemy 保留字）

**执行：**
```bash
python backend/migrations/apply_migrations.py apply
```

### 3. v3_0_1_thread_fields.sql
**v3.0.1 Thread 表字段扩展**

- 添加 `agent_type` 字段到 `thread` 表（default/custom/ai）
- 添加 `agent_id` 字段到 `thread` 表
- 添加 `task_session_id` 字段到 `thread` 表
- 添加 `status` 字段到 `thread` 表（idle/running/paused）
- 添加 `thread_mode` 字段到 `thread` 表（simple/complex）
- 添加 `is_default` 字段到 `customagent` 表

**执行：**
```bash
python backend/migrations/apply_migrations.py apply
```

## 手动执行（备用）

如果自动脚本无法使用，可以手动执行 SQL 文件：

```bash
# 连接到数据库
psql -h localhost -U postgres -d xpouch

# 执行迁移文件
\i backend/migrations/v3_0_complex_mode_refactor.sql
\i backend/migrations/add_message_metadata.sql
\i backend/migrations/v3_0_1_thread_fields.sql
```

## 验证迁移

检查所有表结构：

```sql
-- 查看 Thread 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'thread';

-- 查看 Message 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'message';

-- 查看 CustomAgent 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'customagent';

-- 查看 SubTask 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'subtask';

-- 查看 TaskSession 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasksession';

-- 查看 Artifact 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'artifact';
```

## 新增迁移

1. 创建新的 SQL 文件，命名格式：`vX_Y_description.sql`
2. 在 `apply_migrations.py` 的 `MIGRATIONS` 列表中添加新迁移
3. 在本文档中记录新迁移的说明
4. 提交代码并部署

## 注意事项

1. **幂等性**：所有迁移脚本都是幂等的（可重复执行）
2. **事务安全**：使用 `DO $$` 块确保原子性操作
3. **兼容性**：支持 PostgreSQL 13+
4. **索引**：所有新增字段都自动创建索引
