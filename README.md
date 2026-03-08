<div align="center">

# XPouch AI

**An open-source, controllable multi-expert Agent Runtime for real task execution.**

[![License](https://img.shields.io/badge/License-Apache%202.0%20with%20Additional%20Terms-blue.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/Python-3.13%2B-blue?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.x-green?logo=langchain)](https://langchain-ai.github.io/langgraph/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)

[问题反馈](https://github.com/alex1987chn/xpouch-ai/issues) · [功能讨论](https://github.com/alex1987chn/xpouch-ai/discussions)

</div>

---

## 项目简介

XPouch AI 不是单纯的聊天界面，而是一套围绕真实任务执行构建的 Agent Runtime。

它的核心特点是：

- 有明确的 simple / complex 双模式
- complex 模式具备 HITL 审批与恢复
- 复杂任务会被拆成结构化计划、子任务和 artifact
- 后端通过 SSE 驱动前端 UI，前端只做状态投影
- 当前运行时主语义已经稳定为 `Thread / AgentRun / ExecutionPlan`

如果你想找的是“可控执行”而不是“黑盒聊天”，这个项目就是为这个方向设计的。

## 核心能力

### 1. LangGraph 多专家工作流

- `Router -> Direct Reply`
- `Router -> Commander -> HITL -> Dispatcher -> Generic -> Tools -> Aggregator`
- 支持 simple / complex 自动分流

### 2. HITL 审批与恢复

- Commander 生成计划后暂停
- 用户可确认、修改、删除、调整任务
- 恢复时围绕 `run_id` 精确执行

### 3. Run-based Runtime

- `Thread`：会话
- `AgentRun`：一次执行
- `ExecutionPlan`：复杂任务计划
- 支持 run 级 cancel / timeout / heartbeat / current node

### 4. Artifact 系统

- 代码、Markdown、HTML、文本、多媒体 artifact
- artifact 持久化到数据库
- 历史复杂会话可恢复展示 artifact

### 5. MCP 动态工具接入

- 支持 `sse` / `streamable_http`
- Generic Worker 运行时绑定 `BASE_TOOLS + MCP_TOOLS`
- 可通过后台管理 MCP Server

### 6. Server-Driven UI

- 后端是业务真相源
- 前端通过 SSE 事件驱动 store 和 UI
- 适合继续演进成可审计、可回放的 Agent 产品

## 当前架构

### 运行时主语义

```text
Thread
  -> 会话容器

AgentRun
  -> 一次真实执行

ExecutionPlan
  -> 复杂任务计划
```

### 复杂模式主链

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

### 对外文档

- [CHANGELOG.md](./CHANGELOG.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [LICENSE](./LICENSE)

### 内部架构文档

- [`.ai/active_context.md`](./.ai/active_context.md)
- [`.ai/langgraph_workflow.md`](./.ai/langgraph_workflow.md)
- [`.ai/data_schema.md`](./.ai/data_schema.md)
- [`code review/RUNTIME_REFACTOR_TRACKING_2026-03-07.md`](./code%20review/RUNTIME_REFACTOR_TRACKING_2026-03-07.md)

## 项目现阶段最适合的定位

如果你要在 GitHub 上一句话介绍它，推荐这样讲：

> XPouch AI is an open-source, controllable multi-expert Agent Runtime for real task execution, with HITL approval, run-based execution semantics, artifact persistence, and MCP tool integration.

## 路线图

### 已完成

- run-based runtime 语义重构
- complex 模式 HITL / resume / artifact 主链闭环
- run 级 cancel / timeout / heartbeat / current node
- MCP 动态工具接入
- Server-Driven UI 事件架构

### 下一阶段

- durable run / run ledger
- replay / eval / regression assets
- tool governance / risk tier / selective approval
- skill / template abstraction
- 同线程单活跃 run 约束

## 适合谁

- 想研究 LangGraph 多节点 Agent Runtime 的开发者
- 想要一个可改造的开源 Agent 执行底座的团队
- 想做 HITL、artifact、run-based execution、MCP 集成的产品原型

## 许可证

本项目采用 **Apache License 2.0 + 附加条款** 开源。
详细条款见 [LICENSE](./LICENSE)。

---

**如果这个项目对你有帮助，欢迎 Star。**
