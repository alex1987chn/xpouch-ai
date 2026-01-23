# 数据库迁移文档

## 概述

本系统使用自定义的迁移工具管理数据库schema变更，支持版本控制和回滚功能。

## 目录结构

```
backend/migrations/
├── __init__.py                            # 模块初始化
├── runner.py                              # 迁移运行器
├── migrate.py                             # 迁移执行脚本
├── migration_001_architecture_refactoring.py  # 迁移脚本 v001
└── README.md                             # 本文档
```

## 使用方法

### 1. 应用迁移

```bash
cd backend
python migrations/migrate.py
```

这将应用所有待执行的迁移。

### 2. 回滚迁移

```bash
cd backend
python migrations/migrate.py --rollback
```

这将回滚最新应用的迁移（仅删除索引，SQLite不支持DROP COLUMN）。

### 3. 查看迁移状态

```bash
cd backend
python migrations/migrate.py --status
```

这将显示已应用的迁移和待应用的迁移列表。

### 4. 查看帮助

```bash
cd backend
python migrations/migrate.py --help
```

## 已应用的迁移

### v001: 架构重构

**描述**: 架构重构：添加会话类型、默认助手、Artifacts支持

**变更内容**:

1. **Conversation表**
   - 新增 `agent_type` VARCHAR(20) DEFAULT 'default'
   - 新增 `agent_id` VARCHAR(100)
   - 新增 `task_session_id` VARCHAR(100)
   - 新增索引: `ix_conversation_agent_type`, `ix_conversation_agent_id`, `ix_conversation_task_session_id`

2. **CustomAgent表**
   - 新增 `is_default` BOOLEAN DEFAULT 0
   - 新增索引: `ix_customagent_is_default`

3. **SubTask表**
   - 新增 `artifacts` JSON

4. **TaskSession表**
   - 新增 `conversation_id` VARCHAR(100)
   - 新增索引: `ix_tasksession_conversation_id`

5. **数据迁移**
   - 为现有Conversation记录设置agent_id=id, agent_type='custom'

**应用日期**: 2026-01-22

## 创建新迁移

### 1. 创建迁移文件

在 `migrations/` 目录下创建新的迁移文件，命名规则为：
```
migration_{version}_{description}.py
```

例如：`migration_002_add_new_feature.py`

### 2. 实现迁移类

```python
import sqlite3
from .runner import Migration

class Migration002AddNewFeature(Migration):
    version = "002"
    description = "添加新功能"

    def up(self, conn: sqlite3.Connection):
        """执行迁移"""
        # 添加新字段
        conn.execute("ALTER TABLE table_name ADD COLUMN new_column VARCHAR(100)")

        # 创建索引
        conn.execute("CREATE INDEX IF NOT EXISTS ix_table_new_column ON table_name(new_column)")

    def down(self, conn: sqlite3.Connection):
        """回滚迁移"""
        # 删除索引
        conn.execute("DROP INDEX IF EXISTS ix_table_new_column")
        # 注意：SQLite不支持DROP COLUMN
```

### 3. 注册迁移

在 `migrations/migrate.py` 的 `migrations` 列表中添加新迁移：

```python
migrations = [
    Migration001ArchitectureRefactoring(),
    Migration002AddNewFeature(),  # 新增
]
```

## 注意事项

### SQLite 限制

1. **不支持 DROP COLUMN**: SQLite 不支持删除列，回滚时只能删除索引
2. **ALTER TABLE 限制**: SQLite 的 ALTER TABLE 功能有限，只支持：
   - RENAME TABLE
   - RENAME COLUMN
   - ADD COLUMN

### 建议

1. **先备份数据库**: 在执行迁移前，建议备份数据库文件
2. **测试环境验证**: 在测试环境先验证迁移脚本
3. **版本号递增**: 新迁移的版本号应递增（如 001, 002, 003...）
4. **描述清晰**: 迁移描述应清晰说明变更内容

## 迁移记录

迁移记录存储在数据库的 `__migrations__` 表中：

```sql
SELECT * FROM __migrations__ ORDER BY version;
```

表结构：
- `version`: 迁移版本号（主键）
- `description`: 迁移描述
- `applied_at`: 应用时间（ISO格式）

## 故障排除

### 迁移失败

如果迁移执行失败，可以：

1. 查看错误信息，定位问题
2. 修复迁移脚本
3. 回滚失败的迁移
4. 重新执行迁移

### 数据库锁定

如果遇到数据库锁定错误，请确保：

1. 没有其他进程正在访问数据库
2. 停止后端服务（uv run main.py）
3. 重新执行迁移

### 字段已存在

如果提示字段已存在，说明部分迁移已执行：

1. 查看 `__migrations__` 表确认已应用的迁移
2. 手动添加缺失的迁移记录（如果字段已存在）

## 参考资源

- [SQLite ALTER TABLE 文档](https://www.sqlite.org/lang_altertable.html)
- [XPouch AI 架构文档](../ARCHITECTURE_REFACTORING.md)
- [XPouch AI README](../README.md)
