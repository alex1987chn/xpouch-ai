<div align="center">

# 🚀 XPouch AI

**Infinite Minds. One Pouch.**

[![License](https://img.shields.io/badge/License-Apache%202.0%20with%20Additional%20Terms-blue.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/Python-3.13%2B-blue?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.0%2B-green?logo=langchain)](https://langchain-ai.github.io/langgraph/)
[![Version](https://img.shields.io/badge/Version-3.1.0-blue.svg)](./CHANGELOG.md)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)

[English](./README.md) | [简体中文](./README.zh-CN.md)

<img src="https://github.com/user-attachments/assets/c4554212-e24e-47dd-a61d-8df4f69ce233" alt="XPouch AI Screenshot" width="800">

**下一代 LangGraph 智能协作平台** — 引入 HITL 人机回环、可视化工作流与工业级交互体验。

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
10 位专业专家协同工作：搜索、编程、研究、分析、写作、规划、**设计、架构**、图像分析、长期记忆。

</td>
</tr>
<tr>
<td width="50%">

### 📦 智能 Artifact 系统
代码、图表、文档、网页预览——AI 输出转化为**结构化可视化工件**，支持实时编辑、PDF/Markdown 导出。

</td>
<td width="50%">

### 🧠 长期记忆
基于 pgvector 的向量检索，自动提取和存储用户偏好、习惯，实现**个性化 AI 体验**。

</td>
</tr>
</table>

---

## 🚀 快速开始

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
<summary>📋 环境变量配置</summary>

```env
# 必需：至少配置一个 LLM 提供商
DEEPSEEK_API_KEY=sk-your-key
OPENAI_API_KEY=sk-your-key

# 必需：JWT 密钥
JWT_SECRET_KEY=your-secure-random-key

# 可选：记忆系统嵌入模型
SILICON_API_KEY=your-key  # 推荐 BAAI/bge-m3
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

### 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 19 + TypeScript + Vite + Tailwind CSS |
| **状态** | Zustand + Immer (严格 Slice 隔离) |
| **后端** | FastAPI + Python 3.13 |
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
│   │   ├── store/          # Zustand Store (Slice 模式)
│   │   ├── handlers/       # SSE 事件处理
│   │   └── services/       # API 服务 (Barrel 模式)
│   └── Dockerfile
├── backend/                # FastAPI + LangGraph
│   ├── agents/             # LangGraph 工作流
│   │   ├── nodes/          # Router/Commander/Generic
│   │   └── services/       # Expert/Task Manager
│   ├── routers/            # REST API
│   ├── tools/              # Function Calling 工具
│   └── Dockerfile
└── docker-compose.yml
```

---

## 🛠️ 开发指南

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动前后端（并发）
pnpm run dev

# 或分别启动
pnpm run dev:frontend  # http://localhost:5173
pnpm run dev:backend   # http://localhost:3002
```

### 代码规范

- **提交信息**: 使用 [Conventional Commits](https://www.conventionalcommits.org/)
  ```bash
  git commit -m "feat: add human-in-the-loop approval"
  git commit -m "fix: resolve artifact rendering issue"
  ```
- **代码风格**: ESLint + Prettier
- **类型安全**: TypeScript 严格模式

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

---

<div align="center">

**⭐ Star 我们，如果这个项目对你有帮助！**

[🚀 在线体验](https://xpouch.ai) · [🐛 报告问题](https://github.com/alex1987chn/xpouch-ai/issues) · [💡 功能建议](https://github.com/alex1987chn/xpouch-ai/discussions)

</div>
