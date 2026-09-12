# XPouch AI 自部署指南

面向想把 XPouch AI 部署到自己服务器（或内网）的管理员。读完这篇，你可以完成：启动服务 → 注册管理员账号 → 配置模型 → 开始使用。

> 发现文档与实际行为不一致？欢迎提 [Issue](https://github.com/alex1987chn/xpouch-ai/issues)。

## 前置要求

- Docker 24+ 与 Docker Compose v2
- 至少一个 LLM Provider 的 API Key（推荐 [DeepSeek](https://platform.deepseek.com/)，也支持 Moonshot/OpenAI/Anthropic/Google）
- 一个可用的端口（默认前端暴露 `8080`）

## 快速开始

```bash
git clone https://github.com/alex1987chn/xpouch-ai.git
cd xpouch-ai

# ① 根目录 .env：docker-compose 插值数据库账号密码（缺它 db 起不来）
cp .env.example .env
# 编辑 .env：修改 POSTGRES_PASSWORD 等数据库三项

# ② 后端 .env：应用运行配置
cp backend/.env.example backend/.env
# 编辑 backend/.env：至少配置一个 LLM Key（见下文）

docker compose up -d --build
```

启动完成后：

1. 浏览器打开 `http://<你的服务器>:8080`
2. 点击「登录」，用手机号接收验证码注册——**全新部署（用户表为空）时，首个注册的账号自动成为管理员**，无需任何额外配置
3. 登录后进入「设置 → 系统状态」确认：数据库已连接、迁移已对齐、模型 Provider 已配置
4. 首页输入框发一条消息，完成首次调用

> 老式初始化方式（可选）：在启动前设置 `INITIAL_ADMIN_EMAIL` 或 `INITIAL_ADMIN_PHONE`，启动时匹配的第一个注册账号会被提升为管理员。适用于存量实例补管理员。全新部署推荐直接用上面的首注册自动晋升。

## 环境变量参考（backend/.env）

### 必配

| 变量 | 说明 |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | 数据库初始化凭据（compose 会注入给后端） |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（默认模型 Provider） |
| `JWT_SECRET_KEY` | 登录态签名密钥，请使用 32+ 位随机串 |

### 常用可选

| 变量 | 默认 | 说明 |
|---|---|---|
| `ENVIRONMENT` | `production` | **Fail-closed**：未设置时按 production 处理；本地开发请显式设为 `development` |
| `MODEL_NAME` | `deepseek-flash` | 系统默认模型（简单模式跟随该项；管理员也可在「设置 → 模型配置」中在线修改全局默认） |
| `CORS_ORIGINS` | — | 前端与后端不同源时需要 |
| `MOONSHOT_API_KEY` | — | 启用 Kimi 系列模型 |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` | — | 启用对应 Provider |
| `SMS_IP_MAX_SENDS_PER_HOUR` | `10` | 同一 IP 每小时最大发码次数（0 = 不限制）。私有内网部署可调大 |
| `TENCENT_CLOUD_SECRET_ID` 等 `SMS_*` | — | 腾讯云短信（验证码通道），不配则开发环境走控制台回退、生产无法发码 |
| `TAVILY_API_KEY` | — | 联网搜索工具 |
| `THREAD_RETENTION_DAYS` | — | 会话保留天数 |

完整清单见 [`backend/.env.example`](../backend/.env.example)（含注释）。

## 模型管理

- 可选模型清单来自 `backend/providers.yaml`：新 Provider 只需在该文件添加配置 + `.env` 配 Key，无需改代码
- 管理员可在「设置 → 模型配置」中修改**全局默认模型**与思考模式，全实例生效；普通用户只读
- 多专家任务（Complex 模式）的模型分配在「专家管理」中按专家配置
- 可为每用户设置**日 token 配额**（「设置 → 系统状态」），超出后新任务被拦截，UTC 零点重置

## 反向代理与 HTTPS

生产环境建议 Nginx 终结 HTTPS 并反代到前端容器（8080）。示例：

```nginx
server {
    listen 443 ssl;
    server_name xpouch.example.com;
    # ssl_certificate / ssl_certificate_key 按需配置

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 后端 SSE 流式接口（走 /api 前缀时由前端同源代理，无需单独 location）
}
```

> `X-Forwarded-For` 会被用于发码 IP 频控，请保留该头。

## 单实例约束（重要）

XPouch 后端按**单 worker 单实例**设计，请勿用 gunicorn/uwsgi 开多 worker，也不要多机副本：

- SSE 断线续传缓冲与发码/登录频控均在进程内存中，多 worker 会导致续传命中错误进程、频控形同虚设
- 单机纵向扩容（CPU/内存）即可支撑中小团队规模；如需多实例高可用，需先把事件缓冲与限流迁到 Redis（暂未实现）

## 升级

```bash
git pull
docker compose up -d --build
```

- 后端容器启动时会自动执行数据库迁移（`alembic upgrade head`）
- 升级后打开「设置 → 系统状态」确认"Migrations: 迁移已对齐"；若显示不一致，说明迁移未成功应用，请查看 `docker logs xpouch-backend`
- 升级前建议先做一次备份（见下文）

## 备份与恢复

数据都在 PostgreSQL 里（业务数据）与 `./postgres_data` 卷（数据目录）。

```bash
# 逻辑备份（推荐，跨版本可恢复）
docker exec xpouch-postgres pg_dump -U xpouch_admin -d xpouch_ai > backup_$(date +%F).sql

# 恢复
cat backup_2026-09-10.sql | docker exec -i xpouch-postgres psql -U xpouch_admin -d xpouch_ai
```

> 恢复到旧备份后再次启动容器，迁移会自动补齐到当前版本（幂等）。

## 常见问题

**发送验证码返回 429？**
同一 IP 每小时发码次数达到上限（默认 10 次）。内网部署可在 `backend/.env` 调大 `SMS_IP_MAX_SENDS_PER_HOUR`（0 为不限制）。

**任务提示"今日 token 用量已达配额上限"？**
管理员在「设置 → 系统状态 → 每用户日 token 配额」中调整，留空为不限量。配额按 UTC 日界重置。

**本地开发端口为什么是 3002 / 容器里是 3000？**
`backend/.env` 的 `PORT` 只影响本地直跑（`python run.py`）；容器内固定 3000，由前端容器统一代理，无需关心。

**迁移报错或"迁移未对齐"？**
生产库的迁移历史可能与代码漂移。先 `docker logs xpouch-backend` 看启动日志；必要时在「设置 → 系统状态」核对当前版本与 head 差异后提 Issue。
