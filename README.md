<div align="center">

# 🚀 XPouch AI

**Infinite Minds. One Pouch.**

[![License](https://img.shields.io/badge/License-Apache%202.0%20with%20Additional%20Terms-blue.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/Python-3.13%2B-blue?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.3%2B-green?logo=langchain)](https://langchain-ai.github.io/langgraph/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)

<img src="https://github.com/user-attachments/assets/c4554212-e24e-47dd-a61d-8df4f69ce233" alt="XPouch AI Screenshot" width="800">

**下一代 LangGraph 智能协作平台 v3.2.4** — 引入 HITL 人机回环、MCP 生态、Streamable HTTP 传输、会话历史分页加载、批量删除与工业级交互体验。

[🚀 在线演示](https://xpouch.ai) · [🐛 问题反馈](https://github.com/alex1987chn/xpouch-ai/issues) · [💬 讨论](https://github.com/alex1987chn/xpouch-ai/discussions)

</div>

---

## ✨ 核心特性

<table>
<tr>
<td width="50%">

### 🎯 Human-in-the-Loop
AI 不再是"黑盒"。Commander 生成任务计划后，**暂停等待你的确认**——修改任务、调整顺序、删除步骤，完全掌控执行流程。

</td>
<td width="50%">

### 🤖 多专家协作
10 位专业专家协同工作：搜索、编程、研究、分析、写作、规划、设计、架构、图像分析、长期记忆。

</td>
</tr>
<tr>
<td width="50%">

### 🔌 MCP 生态支持
原生支持 [Model Context Protocol](https://modelcontextprotocol.io/)，轻松接入外部工具服务。Web 搜索、数据库查询、API 调用——**按需扩展，无限可能**。
- MCP 工具缓存（5分钟 TTL）
- SSE 连接测试和自动重连
- 工具优先级：专业工具 > 通用工具

</td>
<td width="50%">

### 📦 智能 Artifact 系统
代码、图表、文档、网页预览——AI 输出转化为**结构化可视化工件**，支持实时编辑、PDF/Markdown 导出。
- 页面刷新数据持久化
- 会话切换状态隔离
- 支持多类型产物（代码/Markdown/图表）

</td>
</tr>
<tr>
<td width="50%">

### 🧠 长期记忆
基于 pgvector 的向量检索，自动提取和存储用户偏好、习惯，实现**个性化 AI 体验**。

</td>
<td width="50%">

### 🔀 智能路由
后端自动判断简单/复杂模式：日常对话直接响应，复杂任务自动触发多专家协作，无需手动切换。

</td>
</tr>
<tr>
<td width="50%">

### 🎨 Server-Driven UI
后端驱动 UI，通过 SSE 实时推送状态更新。前端作为"投影仪"，只负责渲染，逻辑由后端统一控制。

</td>
<td width="50%">

### 🎨 语义化主题系统
基于 Design Tokens 的主题系统，支持 Light/Dark 双主题。使用语义化变量（`surface-*`, `content-*`, `border-*`, `accent-*`），新增主题无需修改组件代码。

</td>
</tr>
</table>

---

## 🚀 快速开始

### 系统要求

| 组件 | 最低版本 |
|------|---------|
| Docker | 20.0+ |
| Docker Compose | 2.0+ |
| Node.js (本地开发) | 18.0+ |
| Python (本地开发) | 3.13+ |

### Docker 一键部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/alex1987chn/xpouch-ai.git
cd xpouch-ai

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，添加你的 LLM API Key

# 3. 启动服务
docker-compose up -d --build

# 4. 初始化数据
docker exec -it xpouch-backend uv run scripts/init_experts.py
docker exec -it xpouch-backend uv run scripts/init_checkpoints.py
```

访问 http://localhost:8080 🎉

<details>
<summary>📋 环境变量配置详解</summary>

```env
# ============================================================================
# 必需配置
# ============================================================================

# 至少配置一个 LLM 提供商 API Key
DEEPSEEK_API_KEY=sk-your-deepseek-key      # 推荐，性价比高
OPENAI_API_KEY=sk-your-openai-key          # 可选
ANTHROPIC_API_KEY=sk-ant-your-key          # 可选
MINIMAX_API_KEY=your-minimax-key           # 可选，推荐用于 Router

# JWT 密钥（生产环境请使用强密钥）
JWT_SECRET_KEY=your-secure-random-key

# PostgreSQL 配置
POSTGRES_USER=xpouch_admin
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=xpouch_ai

# ============================================================================
# 可选配置
# ============================================================================

# 联网搜索（Tavily）
TAVILY_API_KEY=tvly-your-tavily-key

# 向量嵌入模型（用于长期记忆）
SILICON_API_KEY=your-silicon-key           # 推荐 BAAI/bge-m3

# LangSmith 追踪（调试用）
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_your-key
```

**支持的 LLM 提供商**：DeepSeek、OpenAI、Anthropic、Google Gemini、MiniMax、Moonshot

</details>

<details>
<summary>🔌 MCP Server 配置</summary>

XPouch AI 支持通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 接入外部工具服务。

**配置方式**：
1. 访问 Library 页面 (`/library`)
2. 点击「添加 MCP Server」
3. 填写 Server 信息：
   - **名称**: 唯一标识（如 `fetch-server`）
   - **描述**: 功能说明
   - **SSE URL**: MCP Server 的 SSE 端点（如 `http://localhost:3001/sse`）
4. 系统会自动测试连接
5. 启用后，工具将自动注入 LangGraph 运行时

**示例 MCP Servers**：
- [MCP Fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch) - Web 内容获取
- [MCP Filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) - 文件系统操作
- [MCP GitHub](https://github.com/modelcontextprotocol/servers/tree/main/src/github) - GitHub API 集成

**技术细节**：
- 传输协议：SSE (Server-Sent Events)
- 客户端：[langchain-mcp-adapters](https://github.com/langchain-ai/langchain-mcp-adapters)
- 工具优先级：MCP 专业工具 > 内置通用工具

</details>

<details>
<summary>🔍 故障排除</summary>

| 问题 | 解决方案 |
|------|---------|
| 容器启动失败 | 检查端口 8080/5432 是否被占用 |
| 数据库连接失败 | 等待 PostgreSQL 完全启动（约 10-30 秒） |
| LLM 调用失败 | 检查 API Key 是否正确配置 |
| 前端白屏 | 检查浏览器控制台，确认后端 API 可访问 |

```bash
# 查看容器日志
docker logs xpouch-backend
docker logs xpouch-frontend

# 重启服务
docker-compose restart

# 完全重建
docker-compose down -v
docker-compose up -d --build
```

</details>

---

## 🏗️ 架构

### Server-Driven UI

```
┌─────────────────────────────────────────────────────────────┐
│                    Backend (LangGraph)                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Router  │→│Commander│→│Generic  │→│Aggregator│        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│       ↓              ↓            ↓           ↓             │
│   SSE Events ──────────────────────→ Frontend Store         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Events  │→│  Store  │→│  State  │→│   UI    │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────┘
```

**核心理念**：后端是唯一的真理来源，前端只是后端的"投影仪"——接收事件、存储状态、渲染 UI，不做业务逻辑计算。

**安全架构**:
```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ HttpOnly    │  │ CORS        │  │ Rate Limiting       │  │
│  │ Cookie      │  │ Whitelist   │  │ & SSRF Protection   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend (LangGraph)                      │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | React 19 + TypeScript + Vite 7 |
| **状态管理** | Zustand 5 + Immer (Slice 模式) |
| **服务端状态** | TanStack Query 5 (React Query) |
| **UI 组件** | shadcn/ui + Radix UI + Tailwind CSS 3 |
| **动画** | Framer Motion 12 |
| **后端框架** | FastAPI + Python 3.13 |
| **ORM** | SQLModel (SQLAlchemy + Pydantic) |
| **AI 框架** | LangGraph + LangChain |
| **数据库** | PostgreSQL 15 + pgvector |
| **部署** | Docker + Docker Compose |

---

## 📁 项目结构

```
xpouch-ai/
├── frontend/               # React 19 + TypeScript
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   │   ├── bauhaus/    # Bauhaus 风格组件 ⭐
│   │   │   ├── chat/       # 聊天相关组件
│   │   │   ├── layout/     # 布局组件
│   │   │   └── ui/         # shadcn/ui 基础组件
│   │   ├── store/          # Zustand Store (Slice 模式)
│   │   ├── handlers/       # SSE 事件处理
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── i18n/           # 国际化 (模块化) ⭐
│   │   ├── services/       # API 服务 (Barrel 模式)
│   │   └── pages/          # 页面组件
│   │       └── library/    # MCP Server 管理页面 ⭐
│   └── Dockerfile
├── backend/                # FastAPI + LangGraph
│   ├── agents/             # LangGraph 工作流
│   │   ├── nodes/          # Router/Commander/Generic/Aggregator
│   │   │   └── router.py   # 智能降级 JSON Mode ⭐
│   │   └── services/       # Expert/Task Manager
│   ├── routers/            # REST API 路由
│   │   └── mcp.py          # MCP Server 管理 API ⭐
│   ├── services/           # 业务逻辑层 ⭐
│   │   └── invoke_service.py  # 双模调用服务 ⭐
│   ├── tools/              # Function Calling 工具
│   ├── models/             # SQLModel 数据模型
│   │   └── mcp_server.py   # MCP Server 模型 ⭐
│   └── Dockerfile
├── docker-compose.yml
└── CHANGELOG.md            # 更新日志
```

---

## 🛠️ 开发指南

### 本地开发

```bash
# 安装前端依赖
cd frontend
pnpm install

# 安装后端依赖（需要 uv）
cd ../backend
uv sync

# 启动前后端（需要两个终端）
# 终端 1 - 后端
cd backend && uv run uvicorn main:app --reload --port 3002

# 终端 2 - 前端
cd frontend && pnpm dev
```

- 前端: http://localhost:5173
- 后端 API: http://localhost:3002
- API 文档: http://localhost:3002/docs

### 代码规范

- **提交信息**: 使用 [Conventional Commits](https://www.conventionalcommits.org/)
  ```bash
  git commit -m "feat: add human-in-the-loop approval"
  git commit -m "fix: resolve artifact rendering issue"
  git commit -m "docs: update installation guide"
  ```
- **代码风格**: ESLint + Prettier (前端), Ruff (后端)
- **类型安全**: TypeScript 严格模式

---

## 📖 文档

| 文档 | 描述 |
|------|------|
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新日志 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献指南 |
| [LICENSE](./LICENSE) | 许可证 (Apache 2.0 + 附加条款) |
| [backend/.env.example](./backend/.env.example) | 环境变量配置示例 |

---

## 🔐 安全说明

### 认证安全
- **HttpOnly Cookie**: JWT Token 存储在 HttpOnly Cookie 中，防止 XSS 攻击
- **短时效 Token**: Access Token 60 分钟过期，Refresh Token 60 天过期
- **自动刷新**: 前端拦截器实现静默 Token 刷新，用户无感知续期
- **密码安全**: 使用 bcrypt 哈希存储，支持密码强度验证

### 数据安全
- **SSRF 防护**: MCP Server URL 严格验证，禁止内网地址和 file:// 协议
- **SQL 注入防护**: 使用 SQLModel ORM，参数化查询
- **CORS 限制**: 白名单配置，仅允许指定域名访问

### 网络安全
- **连接超时**: MCP SSE 连接 10 秒超时，防止资源耗尽
- **重连保护**: SSE 重连机制带指数退避，防止 DDoS
- **请求限流**: 基于 IP 的请求频率限制

## 🗺️ 路线图

- [x] **MCP 生态支持** ✅ —— 接入外部工具服务，动态扩展 AI 能力
- [x] **代码审查修复** ✅ 
- [x] **自动 Token 刷新** ✅ 
- [ ] 多租户支持
- [ ] 插件系统
- [ ] 更多 LLM 提供商支持
- [ ] 移动端原生应用
- [ ] 工作流可视化编辑器

---

## 🤝 贡献

我们欢迎所有形式的贡献！

1. **Fork** 本仓库
2. 创建 **Feature Branch** (`git checkout -b feature/amazing-feature`)
3. **提交** 更改 (`git commit -m 'feat: add amazing feature'`)
4. **推送** 到分支 (`git push origin feature/amazing-feature`)
5. 打开 **Pull Request**

查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详细信息。

### 贡献者

<a href="https://github.com/alex1987chn/xpouch-ai/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=alex1987chn/xpouch-ai" />
</a>

---

## 📄 许可证

本项目采用 **Apache License 2.0 + 附加条款** 开源。

| 使用场景 | 许可 |
|----------|------|
| 个人学习 | ✅ 允许 |
| 内部部署 | ✅ 允许 |
| 单一客户部署 | ✅ 允许 |
| SaaS 云服务 | ❌ 禁止 |
| 修改 Logo | ❌ 禁止 |

查看 [LICENSE](./LICENSE) 了解详细信息。

---

## 🙏 致谢

- [LangGraph](https://github.com/langchain-ai/langgraph) - AI 工作流编排
- [shadcn/ui](https://ui.shadcn.com/) - UI 组件库
- [FastAPI](https://fastapi.tiangolo.com/) - Python Web 框架
- [pgvector](https://github.com/pgvector/pgvector) - 向量检索
- [TanStack Query](https://tanstack.com/query) - 服务端状态管理

---

<div align="center">

**⭐ Star 我们，如果这个项目对你有帮助！**

[🚀 在线体验](https://xpouch.ai) · [🐛 报告问题](https://github.com/alex1987chn/xpouch-ai/issues) · [💡 功能建议](https://github.com/alex1987chn/xpouch-ai/discussions)

</div>
