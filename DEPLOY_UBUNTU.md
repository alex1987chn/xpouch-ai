# Ubuntu 生产环境部署指南

## 前置要求

- Ubuntu 20.04+ / 22.04+
- Docker 20.10+ 
- Docker Compose 2.0+
- 至少 4GB 内存

## 部署步骤

### 1. 克隆代码并进入目录

```bash
git clone <your-repo-url>
cd xpouch-ai
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp backend/.env.example backend/.env

# 编辑 .env 文件，填写生产环境配置
nano backend/.env
```

**必须修改的字段**：
- `POSTGRES_PASSWORD`: 数据库密码（生产环境必须使用强密码）
- `DATABASE_URL`: 确认使用 `db` 作为主机名
- `JWT_SECRET_KEY`: 生成随机密钥 `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
- `DEEPSEEK_API_KEY` 或其他 LLM API Key
- `CORS_ORIGINS`: 改为生产域名，如 `https://your-domain.com`
- `ENVIRONMENT`: 改为 `production`

### 3. 执行数据库迁移

**这是最容易遗漏的步骤！**

```bash
# 启动数据库
docker-compose up -d db

# 等待数据库启动（约 10 秒）
sleep 10

# 执行 migrations
docker exec -i xpouch-postgres psql -U xpouch_admin -d xpouch_ai < backend/migrations/apply_all_migrations.sql

# 执行 checkpoint 表迁移（复杂模式必需）
docker exec -i xpouch-postgres psql -U xpouch_admin -d xpouch_ai < backend/migrations/checkpoint_tables.sql

# 验证表是否创建成功
docker exec xpouch-postgres psql -U xpouch_admin -d xpouch_ai -c "\dt"
```

### 4. 构建并启动服务

```bash
# 构建镜像
docker-compose build

# 启动所有服务
docker-compose up -d

# 查看后端日志（检查是否有错误）
docker-compose logs -f backend
```

### 5. 初始化系统专家数据

```bash
# 进入后端容器执行专家初始化
docker exec -it xpouch-backend bash

# 在容器内执行
uv run python -m scripts.init_experts

# 退出容器
exit
```

### 6. 验证部署

```bash
# 检查所有容器状态
docker-compose ps

# 测试后端 API
curl http://localhost:3000/api/health

# 测试前端
curl http://localhost:8080
```

## 常见问题排查

### 问题 1: 后端服务一直重启

**症状**: `docker-compose ps` 显示 backend 状态为 `Restarting`

**排查步骤**:
```bash
# 查看日志
docker-compose logs backend

# 常见原因：
# 1. 数据库连接失败 - 检查 DATABASE_URL 是否正确
# 2. 表不存在 - 确认 migrations 已执行
# 3. 端口被占用 - 检查 3000 端口
```

### 问题 2: 数据库表不存在

**症状**: 日志显示 `relation "xxx" does not exist`

**解决**:
```bash
# 重新执行 migrations
docker exec -i xpouch-postgres psql -U xpouch_admin -d xpouch_ai < backend/migrations/apply_all_migrations.sql

# 重启后端
docker-compose restart backend
```

### 问题 3: 复杂模式无法使用

**症状**: 选择复杂模式后报错或无法生成任务

**排查**:
```bash
# 检查 checkpoint 表是否存在
docker exec xpouch-postgres psql -U xpouch_admin -d xpouch_ai -c "SELECT * FROM checkpoint_migrations;"

# 如果没有记录，重新执行
docker exec -i xpouch-postgres psql -U xpouch_admin -d xpouch_ai < backend/migrations/checkpoint_tables.sql
```

### 问题 4: 前端无法连接后端

**症状**: 页面加载但 API 请求失败

**检查**:
1. 确认 `CORS_ORIGINS` 包含前端域名
2. 检查 Nginx 配置（如果前端通过 Nginx 代理）
3. 查看浏览器开发者工具 Network 面板

## 生产环境优化

### 1. 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # 后端 API
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # SSE 支持
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

### 2. 启用 HTTPS

使用 Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 3. 数据库备份

```bash
# 创建备份脚本
#!/bin/bash
BACKUP_DIR="/backups/xpouch"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

docker exec xpouch-postgres pg_dump -U xpouch_admin xpouch_ai > $BACKUP_DIR/backup_$DATE.sql

# 保留最近 7 天备份
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
```

### 4. 日志管理

```bash
# 限制日志大小
docker-compose logs --tail=100 -f backend

# 或使用 logrotate
sudo vim /etc/logrotate.d/xpouch
```

## 更新部署

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建
docker-compose build

# 3. 执行新的 migrations（如果有）
docker exec -i xpouch-postgres psql -U xpouch_admin -d xpouch_ai < backend/migrations/apply_all_migrations.sql

# 4. 重启服务
docker-compose down
docker-compose up -d

# 5. 检查状态
docker-compose ps
docker-compose logs -f backend
```

## 健康检查命令

```bash
# 检查所有服务
docker-compose ps

# 查看资源使用
docker stats

# 检查数据库连接
docker exec xpouch-backend uv run python -c "from database import engine; print('DB OK')"

# 测试 API
curl http://localhost:3000/api/threads
```

## 紧急恢复

如果部署完全失败，清理重新部署：

```bash
# 停止所有服务
docker-compose down

# 删除数据卷（警告：会丢失所有数据！）
docker volume rm xpouch-ai_postgres_data

# 重新部署（按照上面的步骤）
```

---

**提示**: 首次部署建议先在测试环境验证所有步骤，特别是 migrations 的执行。
