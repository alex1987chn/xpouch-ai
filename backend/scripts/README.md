# PostgreSQL 数据库迁移指南

## 概述

本项目已从 SQLite 迁移至 PostgreSQL，采用混合开发模式：
- **开发环境**：后端代码在宿主机运行，数据库在 Docker 容器中运行
- **部署环境**：后端和数据库均在 Docker 容器中运行

## 快速开始

### 1. 启动 PostgreSQL 容器

```bash
cd "d:\Personal Project\xpouch-ai"
docker-compose up -d db
```

### 2. 安装 Python 依赖

```bash
cd backend
uv sync
```

### 3. 初始化数据库

```bash
uv run python -m scripts.init_db
```

或直接运行脚本：

```bash
uv run python backend/scripts/init_db.py
```

### 4. 启动后端服务

```bash
uv run main.py
```

## 配置说明

### 环境变量

在 `backend/.env` 中配置以下变量：

```bash
# PostgreSQL 连接串（开发模式）
DATABASE_URL=postgresql+asyncpg://xpouch_admin:admin123@localhost:5432/xpouch_ai

# PostgreSQL 数据库配置（Docker 部署）
POSTGRES_USER=xpouch_admin
POSTGRES_PASSWORD=admin123
POSTGRES_DB=xpouch_ai
```

### 连接串格式

```
postgresql+asyncpg://[用户名]:[密码]@[主机]:[端口]/[数据库名]
```

## Docker 服务说明

### db 服务

- **镜像**：postgres:15-alpine
- **端口**：5432（宿主机）→ 5432（容器）
- **数据卷**：./postgres_data:/var/lib/postgresql/data
- **健康检查**：pg_isready
- **环境变量**：
  - POSTGRES_USER
  - POSTGRES_PASSWORD
  - POSTGRES_DB

## 默认账号

初始化后会创建以下默认账号：

### 管理员账号

- **用户名**：admin
- **密码**：admin123
- **⚠️ 生产环境请立即修改密码！**

### 默认助手

- **ID**：assistant
- **名称**：通用助手
- **模型**：deepseek-chat

## 数据库迁移

项目使用 SQLModel 的自动迁移机制：

### 运行初始化脚本

```bash
uv run python -m scripts.init_db
```

此脚本会：
1. 创建所有表（SQLModel.metadata.create_all）
2. 检查并创建默认管理员
3. 检查并创建默认助手

### 重新初始化

如需重新初始化数据库（清空数据）：

```bash
# 停止容器
docker-compose down

# 删除数据卷
docker volume rm xpouch-ai_postgres_data

# 重新启动
docker-compose up -d db

# 初始化数据库
uv run python -m scripts.init_db
```

## 连接数据库

### 使用 psql 命令行

```bash
# 进入容器
docker exec -it xpouch-postgres psql -U xpouch_admin -d xpouch_ai

# 或从宿主机连接
psql -h localhost -p 5432 -U xpouch_admin -d xpouch_ai
```

### 使用 GUI 工具

推荐工具：
- DBeaver（跨平台）
- pgAdmin（Web管理）
- DataGrip（JetBrains）

## 故障排查

### 连接失败

**问题**：`could not connect to server: Connection refused`

**解决方案**：
1. 检查 Docker 容器是否运行：`docker ps`
2. 检查端口映射：`docker port xpouch-postgres`
3. 检查防火墙设置

### 认证失败

**问题**：`password authentication failed`

**解决方案**：
1. 检查 `.env` 中的密码配置
2. 确认容器环境变量：`docker exec xpouch-postgres env | grep POSTGRES`

### 表已存在

**问题**：`relation already exists`

**解决方案**：
- SQLModel 的 `create_all` 会自动跳过已存在的表，可忽略此警告

## 性能优化

### 索引优化

SQLModel 自动在以下字段创建索引：
- User: phone_number, email, provider_id
- Conversation: agent_type, agent_id, task_session_id, user_id
- CustomAgent: user_id

### 连接池

使用 `asyncpg` 的默认连接池配置：
- 最小连接：10
- 最大连接：50

## 备份与恢复

### 备份数据库

```bash
# 备份到文件
docker exec xpouch-postgres pg_dump -U xpouch_admin xpouch_ai > backup.sql
```

### 恢复数据库

```bash
# 从文件恢复
docker exec -i xpouch-postgres psql -U xpouch_admin xpouch_ai < backup.sql
```

## 从 SQLite 迁移数据

如需从旧的 SQLite 数据库迁移数据：

1. 导出 SQLite 数据：
   ```bash
   sqlite3 data/database.db .dump > sqlite_dump.sql
   ```

2. 转换 SQL 语法（SQLite → PostgreSQL）
   - 使用 `pgloader` 或 `sqlite3-to-postgres` 工具
   - 手动调整数据类型

3. 导入到 PostgreSQL：
   ```bash
   psql -h localhost -p 5432 -U xpouch_admin -d xpouch_ai < converted_dump.sql
   ```

## 生产部署

### 安全加固

1. **修改默认密码**：
   ```bash
   # 在 .env 中设置强密码
   POSTGRES_PASSWORD=your-secure-password-here
   ```

2. **使用专用数据库用户**：
   - 不要使用 admin 用户运行应用
   - 创建只读用户进行数据查询

3. **启用 SSL 连接**：
   ```
   DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db?sslmode=require
   ```

4. **限制网络访问**：
   ```yaml
   # docker-compose.yml
   db:
     networks:
       - backend-only  # 限制后端访问
   ```

## 参考资源

- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [SQLModel 文档](https://sqlmodel.tiangolo.com/)
- [asyncpg 文档](https://magicstack.github.io/asyncpg/)
- [Docker PostgreSQL 镜像](https://hub.docker.com/_/postgres/)
