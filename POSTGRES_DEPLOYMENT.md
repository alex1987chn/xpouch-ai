# PostgreSQL 部署指南

## 📋 概述

XPouch AI 现已完全迁移至 **PostgreSQL** 数据库，生产环境部署时将自动使用 PostgreSQL 容器。

## ✅ 部署前检查清单

### 1. 配置文件检查

#### backend/.env 配置
确保 `DATABASE_URL` 使用 PostgreSQL 格式：

```bash
# ✅ 正确配置（使用 psycopg 驱动）
DATABASE_URL=postgresql+psycopg://xpouch_admin:your-password@db:5432/xpouch_ai

# ❌ 错误配置（asyncpg 不支持同步引擎）
# DATABASE_URL=postgresql+asyncpg://xpouch_admin:your-password@db:5432/xpouch_ai

# ❌ 已废弃（SQLite 配置）
# DATABASE_URL=sqlite:////app/data/database.db
```

#### docker-compose.yml 检查
- ✅ PostgreSQL 服务已配置并启用
- ✅ Backend 服务依赖 PostgreSQL（`depends_on: db`）
- ✅ Backend 环境变量 `DATABASE_URL` 指向 PostgreSQL
- ✅ Backend 服务已移除 SQLite 数据卷挂载

### 2. 依赖检查

确保 `backend/pyproject.toml` 包含以下依赖：

```toml
[dependencies]
sqlmodel = ">=0.0.31"
psycopg = {version = ">=3.3.0", extras = ["binary"]}
python-dotenv = ">=1.0.0"
```

## 🚀 线上部署步骤

### 方式一：Docker Compose 部署（推荐）

```bash
# 1. 克隆代码
git clone <your-repo-url>
cd xpouch-ai

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填写真实的密码和 API 密钥

# 3. 启动服务
docker-compose up -d

# 4. 检查服务状态
docker-compose ps
docker-compose logs -f
```

### 方式二：Lighthouse/CloudStudio 部署

如果使用云服务器部署，确保：

1. **安装 Docker 和 Docker Compose**
2. **配置环境变量**（同上）
3. **启动服务**：`docker-compose up -d`
4. **配置 Nginx 反向代理**（可选）

## 🔍 部署后验证

### 1. 检查数据库连接

```bash
# 进入 PostgreSQL 容器
docker exec -it xpouch-postgres psql -U xpouch_admin -d xpouch_ai

# 查看所有表
\dt

# 查看数据统计
SELECT 'user' as table_name, COUNT(*) as count FROM "user"
UNION ALL
SELECT 'conversation', COUNT(*) FROM conversation
UNION ALL
SELECT 'message', COUNT(*) FROM message;

# 退出
\q
```

### 2. 检查后端日志

```bash
# 查看后端启动日志
docker logs xpouch-backend

# 应该看到类似输出：
# [Database] Using PostgreSQL: postgresql+psycopg://...
```

### 3. 测试 API

```bash
# 测试健康检查
curl http://your-domain.com/api/health

# 测试登录接口
curl -X POST http://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

## ⚠️ 常见问题

### Q1: 如何切换回 SQLite？

**不推荐**！PostgreSQL 是生产环境标准选择。如果确实需要，修改 `backend/.env`：

```bash
DATABASE_URL=sqlite:////app/data/database.db
```

同时修改 `docker-compose.yml`，重新添加数据卷挂载：

```yaml
backend:
  volumes:
    - ./data:/app/data
```

### Q2: 数据库迁移失败怎么办？

```bash
# 1. 查看迁移日志
docker logs xpouch-postgres

# 2. 重新初始化数据库
docker-compose down
docker volume rm xpouch-ai_postgres_data
docker-compose up -d

# 3. 初始化默认数据
docker exec xpouch-backend python scripts/init_db.py
```

### Q3: 如何备份数据库？

```bash
# 备份 PostgreSQL 数据
docker exec xpouch-postgres pg_dump -U xpouch_admin xpouch_ai > backup.sql

# 恢复数据
docker exec -i xpouch-postgres psql -U xpouch_admin xpouch_ai < backup.sql
```

### Q4: 如何升级数据库密码？

1. 修改 `backend/.env` 中的 `POSTGRES_PASSWORD`
2. 重启 PostgreSQL 容器：
   ```bash
   docker-compose restart db
   ```
3. 如果修改了用户名，还需要更新 `DATABASE_URL`

## 📊 性能监控

### 查看数据库连接数

```bash
docker exec xpouch-postgres psql -U xpouch_admin -d xpouch_ai -c "
  SELECT count(*) FROM pg_stat_activity;
"
```

### 查看慢查询

```bash
docker exec xpouch-postgres psql -U xpouch_admin -d xpouch_ai -c "
  SELECT query, mean_exec_time, calls FROM pg_stat_statements
  ORDER BY mean_exec_time DESC LIMIT 10;
"
```

## 🔒 安全建议

1. **生产环境密码**：使用强密码（32位以上）
2. **JWT 密钥**：使用 `python -c "import secrets; print(secrets.token_urlsafe(32))"` 生成
3. **限制数据库访问**：不要暴露 5432 端口到公网
4. **定期备份**：设置自动备份任务
5. **监控日志**：使用 Sentry 或类似工具监控错误

## 📚 相关文档

- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [SQLModel 文档](https://sqlmodel.tiangolo.com/)
- [FastAPI 数据库最佳实践](https://fastapi.tiangolo.com/tutorial/sql-databases/)
