<div align="center">

# XPouch AI

**一个围绕真实任务执行设计的开源、可控的多专家 Agent Runtime。**

[English](./README.md) | 简体中文

[![License](https://img.shields.io/badge/License-Apache%202.0%20with%20Additional%20Terms-blue.svg)](./LICENSE)
[![CI](https://github.com/alex1987chn/xpouch-ai/actions/workflows/ci.yml/badge.svg)](./actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.13%2B-blue?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.x-green?logo=langchain)](https://langchain-ai.github.io/langgraph/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)

<img src="./.github/images/hero-home.png" alt="XPouch AI 柔和主题" width="900">
<img src="./.github/images/hero-dark.png" alt="XPouch AI 黑暗主题" width="900">

[在线体验](https://xpouch.ai) · [问题反馈](https://github.com/alex1987chn/xpouch-ai/issues) · [功能讨论](https://github.com/alex1987chn/xpouch-ai/discussions)

</div>

---

## 项目简介

XPouch AI 是一个围绕真实任务执行设计的开源多专家 Agent Runtime。系统将规划、审批、执行、恢复和产物沉淀放在同一条可追踪主链中，而不是只提供一层聊天 UI。

当前稳定基线包括：

- simple / complex 双模式
- complex 模式下的 HITL 审批与恢复
- **HITL 修订循环**：驳回+反馈 → 规划专家修订出 v(n+1)，任务保持挂起，可循环裁决或终止
- **用户管理与审计日志**（管理员）：脱敏用户列表、角色编辑、密码重置；管理面变更全量留痕
- **附件文档**：PDF / Word / Excel / MD 等解析为文本注入对话上下文
- **产物大弹框**：视图/代码切换、编辑、导出 MD/PDF、公开分享
- `Thread / AgentRun / ExecutionPlan` 三层运行时语义
- artifact 持久化、恢复展示与多任务串行执行
- 跨轮产物连续性（追问"把上面的图改成时序图"可直接引用历史产物）
- **产物中心**：跨会话浏览全部产物，一键生成公开分享链接
- **双登录**（手机验证码 + 密码），账号与安全独立管理（含忘记密码重置）
- **断线可恢复**：流式中断自动续传，关闭页面任务后台跑完
- 模型思考过程流式展示（reasoning 增量事件，与正文同管道）
- 用户级模型配置（simple 模式自选模型与思考开关，无需重启）
- Token 用量可视化（今日 / 累计）
- 技能模板（Library 面板 + 内置模板 + 一键发起会话）
- 模板导入导出（支持 override/clone/skip 策略的 JSON 导入导出）
- 工具治理（可配置策略，仅管理员）
- **可见但锁的权限模型**：管理入口全员可见，数据与操作按角色控制
- **可访问性基线**：弹窗焦点管理（焦点陷阱/归还）、WCAG AA 对比度、全站图标按钮可访问名
- SSE 驱动的 Server-Driven UI（统一事件协议，恰好一次投递）
- **图片输入（多模态）**：聊天支持附带图片，视觉模型原生理解（非视觉模型显式拒绝）
- **模板分享链接**：公开只读导出，跨实例一键导入
- MCP 动态工具接入
- **双主题（柔和 / 黑暗）**：柔和暖纸色与暖炭黑两套语义配色，切换带光圈扩散过渡动画；中英日多语言界面

## 核心能力

### LangGraph 多专家主链

- `Router -> Direct Reply`
- `Router -> Commander -> HITL -> Dispatcher -> Generic -> Tools -> Aggregator`
- simple / complex 自动分流

### HITL 审批与恢复

- Commander 生成计划后暂停，审批卡与右缘琥珀光晕直达裁决
- **三动作裁决**：批准执行 / 修订并重提（驳回+反馈，规划专家修订出 v(n+1)，任务保持挂起）/ 终止任务
- 用户可修改、删除、调整任务后再批准
- `POST /api/chat/resume` 围绕 `run_id` 恢复执行；修订由后台任务执行，前端轮询感知新版本
- 驳回反馈以 user 消息永久留痕在会话中

### Run-based Runtime

- `Thread` 表达会话容器
- `AgentRun` 表达一次真实执行
- `ExecutionPlan` 表达复杂任务计划
- 支持 run 级 cancel / timeout / heartbeat / current node

### Artifact 系统

- 支持代码、Markdown、HTML、文本等 artifact
- artifact 持久化到数据库
- 历史复杂会话可恢复展示 artifact
- **跨轮连续性**：每条新消息自动携带本会话最近产物的摘要进入规划上下文，Commander 可生成"修改产物 X"类任务；专家经 `get_artifact` 工具按需读取完整内容，不膨胀图状态
- **产物画布与画廊**：侧栏卡片化浏览当前会话与跨会话产物，点击打开大弹框——视图/代码切换、编辑、复制、下载、导出 MD/PDF、公开分享

### 模型思考过程流式展示

- DeepSeek 等推理模型的 `reasoning_content` 以增量事件实时推送
- 思考流先于正文滚动展示，完成后自动收起；随消息持久化，刷新可回看
- 思考开关由用户在设置页控制（见下），思考内容计入输出计费

### 模型配置（管理员）

- 管理员在「系统管理」中选择全局默认 simple 模式模型与思考开关，全实例生效、无需重启
- 可选模型清单来自 `providers.yaml` + Provider API Key（`GET /api/models` 单一真相源），管理员可控可用范围
- 多专家任务（Complex 模式）的模型在「专家管理」中按专家配置
- 普通用户直接使用——模型与思考治理属管理侧（见下方双角色模型）

- 设置页（头像菜单 → 模型配置）自选 simple 模式模型，或跟随系统默认
- 思考模式三态开关（跟随默认 / 开启 / 关闭），仅对声明 `thinking_toggle` 的模型开放
- 偏好存于 `user_settings` 表（JSONB），多端同步；模型列表来自 `GET /api/models`（providers.yaml 单一真相源）

### MCP 动态工具接入

- 支持 `sse` / `streamable_http`
- Generic Worker 运行时绑定 `BASE_TOOLS + MCP_TOOLS`
- 支持后台管理 MCP Server

### 技能模板（Skill Templates）

- 模板模型与 `GET/POST/PUT/DELETE /api/library/templates` 管理接口
- 内置模板：出行路线简报、研究结论报告、写作大纲启动器
- Library 页「Skill Templates」面板：浏览、管理、一键以 starter prompt 发起新会话

### 工具治理（Tool Governance）

- 统一治理层：`risk_tier`、`allow/deny/require_approval`，绑定与执行前双重校验
- 可配置策略：`ToolPolicy` 持久化，`GET/PUT /api/tools/policies`，运行时合并数据库覆盖
- 系统管理台「工具治理」面板：管理员查看/编辑策略

### 用户管理与审计日志（管理员）

- **用户管理**：全实例用户列表（手机号脱敏/按需揭示、UUID、注册时间、最近登录、角色），支持创建用户、编辑资料与角色、重置密码（自定义/系统随机，随机明文仅展示一次）、删除用户（级联清理会话与产物）
- **审计日志**：用户/专家/配额等管理面变更全量留痕（操作者、动作、对象、详情），支持搜索

### 附件文档（多模态上下文）

- 聊天支持附带 PDF / Word / Excel / Markdown / 纯文本文档（单文件 10MB，最多 3 个）
- 后端解析为纯文本注入当前对话上下文，专家直接基于文档内容作答

### Server-Driven UI

- 后端是真相源
- 前端通过 SSE 事件驱动 store 与 UI
- 事件协议 v2：节点经统一出口（`emit_event`）发射结构化事件，经 LangChain custom event 通道直达消费端——每条事件恰好一次投递，不进图状态/checkpoint；前后端事件枚举有契约测试守护
- 传输级 `[DONE]` 完成标记，异常断流与正常结束可区分
- 适合继续演进为可审计、可回放的 Agent 产品

### Run Timeline（运行时间线）

- 独立页面查看运行实例的完整事件时间线
- 支持从对话页面和历史会话卡片跳转
- 展示运行全生命周期事件：run 创建、router 决策、HITL 中断/恢复、任务执行、artifact 生成、运行终态等
- API：`GET /api/runs/{run_id}`、`GET /api/runs/{run_id}/timeline`、`GET /api/runs/thread/{thread_id}/timeline`

### Admin Stats Dashboard（运行统计）

- **全用户开放**：普通用户查看自己的运行数据，管理员查看全实例
- 运行统计概览：总运行数、成功率、待审核数、平均耗时
- 7 天趋势图表：按日期聚合的运行数据
- 运行列表：带分页与搜索（运行 ID / 用户名模糊匹配），显示状态、模式、时间、用户
- 数据库层聚合：使用 `func.count` / `func.sum` / `func.avg` + `group_by`
- API：`GET /api/admin/stats/runs`（概览与趋势内嵌于同一响应）

## 当前架构

```text
Thread
  -> 会话容器

AgentRun
  -> 一次真实执行

ExecutionPlan
  -> 复杂任务计划
```

```text
POST /api/chat
  -> create/get Thread
  -> create AgentRun
  -> Router
  -> Commander
  -> HITL interrupt
  -> POST /api/chat/resume
  -> Dispatcher / Generic / Tools
  -> Aggregator
  -> Artifact + Message
```

面向贡献者的目录导览、事件协议与「如何新增」指南见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 快速开始

> 完整自部署指南（管理员初始化、反向代理与 HTTPS、备份恢复、常见问题）：**[docs/self-hosting.md](docs/self-hosting.md)**

### 环境要求

- Node.js `>= 24.14.0`
- pnpm `11.25.0`（或兼容的 pnpm 11）
- Python `>= 3.13`
- PostgreSQL `18+`
- `uv`（后端依赖与命令管理）

### 方式一：Docker Compose（推荐用于本地联调）

```bash
git clone https://github.com/alex1987chn/xpouch-ai.git
cd xpouch-ai

# ① 根目录 .env：给 docker-compose 插值数据库账号密码（缺它 db 起不来）
cp .env.example .env
# 编辑 .env，修改 POSTGRES_PASSWORD 等数据库三项

# ② 后端 .env：应用运行配置（LLM Key 等）
cp backend/.env.example backend/.env
# 编辑 backend/.env，至少填入一个 LLM API Key

docker-compose up -d --build
```

启动后：

- 前端：`http://localhost:8080`
- **全新部署首个注册的账号自动成为管理员**（无需环境变量；存量实例仍可用 `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PHONE`）
- 打开「系统管理」确认数据库、迁移与模型 Provider 状态
- 数据库：`localhost:5432`

说明：

- 后端容器启动时会执行 `alembic upgrade head`
- Docker Compose 会把容器内后端 `DATABASE_URL` 指向 `db` 服务
- 仓库中的 `docker-compose.yml` 默认面向本地开发 / 联调，数据库端口会暴露到宿主机，便于调试
- 生产环境用 `deploy.sh` 部署：它会合并 `docker-compose.prod.yml`（日志轮转），并把数据库端口默认收紧为仅回环 `127.0.0.1:5432`
- 根目录 `.env` 主要给 `docker-compose.yml` 做变量插值；`backend/.env` 才是后端运行配置来源

### 方式二：本地开发

```bash
# 前端
cd frontend
pnpm install
pnpm dev

# 后端（另一个终端）
cd backend
uv sync
uv run python run.py        # Windows 兼容启动器（事件循环/热重载已处理），默认 3002
```

本地开发默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3002`
- Swagger：`http://localhost:3002/docs`

说明：

- 本地直跑后端默认使用 `backend/.env`
- 如果你使用 Docker Compose，则根目录 `.env` 与 `backend/.env` 会同时参与启动，但职责不同
- 容器内后端监听端口是 `3000`，本地开发命令示例使用的是 `3002`

## 环境变量

最少需要：

```env
DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname
JWT_SECRET_KEY=your-secret

# 至少一个 LLM 提供商
DEEPSEEK_API_KEY=...   # 推荐，默认模型 deepseek-v4-flash
# 或 OPENAI_API_KEY=...
# 或 MOONSHOT_API_KEY=...
```

常用可选项：

- `TAVILY_API_KEY`
- `SILICON_API_KEY`
- `LANGCHAIN_API_KEY`
- `CORS_ORIGINS`
- `RUN_DEADLINE_SECONDS`
- `RUN_MAX_GRAPH_LOOPS`

完整示例见 `backend/.env.example`。

## 开发与验证

```bash
# backend
cd backend
uv run ruff check .
uv run pytest tests/ -q

# frontend
cd frontend
pnpm run lint
npx tsc --noEmit
pnpm run build
```

如果仓库的 pre-commit hooks 已安装，提交时会自动执行检查。

## 运维

### 数据库备份

仓库提供基于 `pg_dump` 的备份脚本（保留最近 N 份轮转）：

```bash
./scripts/backup_db.sh                  # 默认保留 7 份
BACKUP_KEEP=30 ./scripts/backup_db.sh   # 自定义份数
```

服务器建议挂 crontab 每日执行，一键幂等安装：

```bash
./scripts/install_backup_cron.sh         # 安装每天 03:00 的备份任务（重复执行安全）
```

备份输出到 `backups/`（已 gitignore）。

### 环境声明（Fail-closed）

`ENVIRONMENT` 必须显式设置（`development` / `testing` / `production`）。未设置时按 **production** 语义处理：debug 端点关闭、`X-User-ID` 认证旁路关闭、生产级 JWT 校验生效。生产部署务必在 `backend/.env` 中显式配置。

### 健康检查

- 后端：`GET /api/health`（Dockerfile HEALTHCHECK 与 compose healthcheck 均已接入）
- 前端：容器内 wget 探测（compose healthcheck）

## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 架构导览（贡献者先读这篇）
- [CHANGELOG.md](./CHANGELOG.md)
- [DESIGN.md](./DESIGN.md) — UI 设计与交互规范
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [THEME_GUIDE.md](./THEME_GUIDE.md) — 主题系统
- [backend/.env.example](./backend/.env.example)

## 路线图

### 已完成

- run-based runtime 语义重构
- complex 模式 HITL / resume / artifact 主链闭环
- run 级 cancel / timeout / heartbeat / current node
- durable run / run ledger（第一阶段）
- 轻量 replay / eval / regression assets
- 同线程单活跃 run 约束（第一版）
- tool governance / selective approval（第二版首批落地）
- skill / template abstraction（第一版）
- MCP 动态工具接入
- Server-Driven UI 事件架构
- run timeline UI（运行时间线页面）
- admin stats dashboard（管理统计面板）
- 会话恢复与任务续执行（切换会话后可继续执行中的任务）
- 模板导入导出（JSON 格式，支持冲突检测与多种导入策略）
- DeepSeek V4 Flash 迁移（旧模型 ID 别名兼容存量数据）
- 用户级模型配置（simple 模式选模型 + 思考开关）
- 模型思考过程流式展示（reasoning 增量事件）
- 事件协议 v2 统一（恰好一次投递、单通道分发、契约测试）
- 跨轮产物连续性（历史产物注入规划 + get_artifact 工具）
- 密码登录与忘记密码重置（「账号与安全」独立入口）
- 产物中心 + 单产物分享链接（服务端渲染分享页）
- 断线续传流式执行 + 任务后台继续执行
- Token 用量记账与可视化
- 权限锁定态（可见但锁）与 UI 设计规范文档（DESIGN.md）
- 弹窗焦点管理与可访问性基线（a11y）、后端路由结构归一（auth/ 包 + routers/ 单一家族）

### 下一阶段

- 交互式 selective approval UI
- 模板分享（Template Sharing）

## 贡献

欢迎提交 issue、改进建议和 pull request。
开发环境、代码规范和提交流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

本项目采用 **Apache License 2.0 + 附加条款** 开源。
详细条款见 [LICENSE](./LICENSE)。

---

**如果这个项目对你有帮助，欢迎 Star。**
