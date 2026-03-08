<div align="center">

# XPouch AI

**An open-source, controllable multi-expert Agent Runtime for real task execution.**

[![License](https://img.shields.io/badge/License-Apache%202.0%20with%20Additional%20Terms-blue.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/Python-3.13%2B-blue?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.x-green?logo=langchain)](https://langchain-ai.github.io/langgraph/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)

<img src="https://github.com/user-attachments/assets/c4554212-e24e-47dd-a61d-8df4f69ce233" alt="XPouch AI Screenshot" width="900">

[问题反馈](https://github.com/alex1987chn/xpouch-ai/issues) · [功能讨论](https://github.com/alex1987chn/xpouch-ai/discussions)

</div>

---

## 项目简介

XPouch AI 是一个围绕真实任务执行设计的开源多专家 Agent Runtime。系统将规划、审批、执行、恢复和产物沉淀放在同一条可追踪主链中，而不是只提供一层聊天 UI。

当前稳定基线包括：

- simple / complex 双模式
- complex 模式下的 HITL 审批与恢复
- `Thread / AgentRun / ExecutionPlan` 三层运行时语义
- artifact 持久化、恢复展示与多任务串行执行
- 技能模板（Library 面板 + 内置模板 + 一键发起会话）
- 工具治理（可配置策略 + Library 管理面板，view_admin 只读）
- SSE 驱动的 Server-Driven UI
- MCP 动态工具接入

## 核心能力

### LangGraph 多专家主链

- `Router -> Direct Reply`
- `Router -> Commander -> HITL -> Dispatcher -> Generic -> Tools -> Aggregator`
- simple / complex 自动分流

### HITL 审批与恢复

- Commander 生成计划后暂停
- 用户可修改、删除、调整任务
- `POST /api/chat/resume` 围绕 `run_id` 恢复执行

### Run-based Runtime

- `Thread` 表达会话容器
- `AgentRun` 表达一次真实执行
- `ExecutionPlan` 表达复杂任务计划
- 支持 run 级 cancel / timeout / heartbeat / current node

### Artifact 系统

- 支持代码、Markdown、HTML、文本等 artifact
- artifact 持久化到数据库
- 历史复杂会话可恢复展示 artifact

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
- Library 页「Tool Governance」面板：管理员查看/编辑策略（`view_admin` 只读）

### Server-Driven UI

- 后端是真相源
- 前端通过 SSE 事件驱动 store 与 UI
- 适合继续演进为可审计、可回放的 Agent 产品

### Run Timeline（运行时间线）

- 独立页面查看运行实例的完整事件时间线
- 支持从对话页面和历史会话卡片跳转
- 展示 16 种事件类型：run 创建、router 决策、HITL 中断/恢复、任务执行、artifact 生成、运行终态等
- API：`GET /api/runs/{run_id}`、`GET /api/runs/{run_id}/timeline`、`GET /api/runs/thread/{thread_id}/timeline`

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

## 快速开始

### 环境要求

- Node.js `>= 24.14.0`
- pnpm `10.28.1`（或兼容的 pnpm 10）
- Python `>= 3.13`
- PostgreSQL `18+`
- `uv`（后端依赖与命令管理）

### 方式一：Docker Compose（推荐用于本地联调）

```bash
git clone https://github.com/alex1987chn/xpouch-ai.git
cd xpouch-ai

cp backend/.env.example backend/.env
# 编辑 backend/.env，至少填入一个 LLM API Key

docker-compose up -d --build
```

启动后：

- 前端：`http://localhost:8080`
- 数据库：`localhost:5432`

说明：

- 后端容器启动时会执行 `alembic upgrade head`
- Docker Compose 会把容器内后端 `DATABASE_URL` 指向 `db` 服务
- 仓库中的 `docker-compose.yml` 默认面向本地开发 / 联调，数据库端口会暴露到宿主机，便于调试
- 生产环境请使用你自己的部署流程或覆盖配置，不要直接把当前 compose 视为生产默认模板
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
uv run uvicorn main:app --reload --port 3002
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
DEEPSEEK_API_KEY=...
# 或 MINIMAX_API_KEY=...
# 或 OPENAI_API_KEY=...
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
pnpm run build
```

如果仓库的 pre-commit hooks 已安装，提交时会自动执行检查。

## 文档

- [CHANGELOG.md](./CHANGELOG.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [LICENSE](./LICENSE)
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

### 下一阶段

- 交互式 selective approval UI
- 模板导入导出 / 分享
- run dashboard / timeline UI

## 贡献

欢迎提交 issue、改进建议和 pull request。
开发环境、代码规范和提交流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

本项目采用 **Apache License 2.0 + 附加条款** 开源。
详细条款见 [LICENSE](./LICENSE)。

---

**如果这个项目对你有帮助，欢迎 Star。**
