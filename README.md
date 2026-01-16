# XPouch AI

基于 LangGraph 的高颜值多智能体 AI 助手。

## 🚀 功能特性

### 前端功能
- **多智能体系统**：8 个专业化 AI 智能体 + **自定义智能体创建**
- **实时打字效果**：自然的消息生成与打字动画
- **响应式设计**：完美适配移动端、平板和桌面设备
- **深色模式支持**：根据系统偏好自动切换主题，**平滑过渡动画**
- **国际化**：支持英语、中文和日语
- **路由管理**：React Router 深度集成，支持 URL 分享会话
- **数据持久化**：告别 LocalStorage，聊天记录云端同步（基于 SQLite）
- **性能优化**：
    - Zustand 全局状态管理
    - 组件逻辑与视图分离
    - 智能缓存与按需加载

### 后端功能
- **Python LangGraph**：迁移至 Python 生态，利用更强大的 AI 工具链
- **FastAPI 服务**：高性能异步 API 服务
- **SQLModel + SQLite**：轻量级但强大的关系型数据库支持
- **真实流式响应**：基于 Token 的实时流式传输 (SSE)
- **多模型支持**：DeepSeek、OpenAI、Anthropic、Google
- **RESTful API**：标准化的会话管理接口 (CRUD)
- **上下文记忆**：自动保存和恢复多轮对话上下文

## 🛠️ 技术栈

### 前端
- **框架**：React 18.3.1 + TypeScript 5.6.2
- **路由**：React Router 7
- **状态管理**：Zustand
- **构建工具**：Vite 5.4.17
- **样式**：Tailwind CSS 3.4.17
- **UI 组件**：Radix UI + shadcn/ui
- **图标**：Lucide React
- **测试**：Vitest + React Testing Library

### 后端
- **语言**：Python 3.10+
- **框架**：FastAPI + Uvicorn
- **AI 框架**：LangGraph (Python) + LangChain
- **ORM**：SQLModel (SQLAlchemy + Pydantic)
- **数据库**：SQLite
- **包管理**：uv

## 🏗️ 系统架构

```mermaid
graph TD
    User[用户 Browser] -->|HTTP/WebSocket| Nginx[Nginx (宿主机/网关)]
    
    subgraph Docker Environment
        direction TB
        Nginx -->|端口 8080| Container[Docker 容器组]
        
        subgraph Container
            FE_Nginx[Nginx (前端容器)]
            Frontend[React Static Files]
            Backend[FastAPI Python Service]
            DB[(SQLite Database)]
            
            FE_Nginx -->|/ (Route)| Frontend
            FE_Nginx -->|/api (Proxy)| Backend
            Backend <-->|ORM| DB
        end
    end
    
    Backend -->|LangGraph| LLM[LLM API (DeepSeek/OpenAI)]
```

## 📦 项目结构

**Monorepo 架构** - 前端和后端分离，便于维护：

```
xpouch-ai/
├── frontend/                      # 🌐 React 前端应用
│   ├── src/
│   │   ├── components/            # React 组件 (HomePage, ChatPage, Layout...)
│   │   ├── store/                 # Zustand 状态管理
│   │   ├── hooks/                 # 自定义 React Hooks
│   │   ├── services/              # API 客户端 (api.ts)
│   │   └── ...
│   ├── vite.config.ts             # Vite 配置 (代理)
│   └── nginx.conf                 # Nginx 配置 (Docker)
│
├── backend/                       # 🔧 Python 后端
│   ├── agents/                    # LangGraph 智能体
│   │   ├── graph.py               # 工作流定义
│   │   └── ...
│   ├── main.py                    # FastAPI 入口 & 业务逻辑
│   ├── models.py                  # SQLModel 数据库模型
│   ├── database.py                # 数据库连接
│   ├── pyproject.toml             # Python 依赖
│   └── data/                      # 数据持久化目录
│
├── docker-compose.yml             # 🐳 Docker 编排
├── package.json                   # 📦 根配置
├── README.md                      # 📚 本文档
```

## 🚀 快速开始

### 前置条件

- Node.js >= 16.0.0
- Python >= 3.10
- `uv` (推荐的 Python 包管理器)

### 安装

1. **安装前端依赖**

```bash
cd frontend
pnpm install
```

2. **安装后端依赖**

```bash
cd backend
# 如果已安装 uv
uv sync
# 或者使用 pip
pip install -r requirements.txt (需要先导出)
```

### 配置

**后端配置** - 复制 `backend/.env.example` 到 `backend/.env`：

```env
# 后端配置
PORT=3000

# 模型提供商 API Keys（至少选择一个）
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1 # 可选
```

**前端配置** - 复制 `frontend/.env.example` 到 `frontend/.env`：

```env
VITE_API_URL=/api
```

### 运行应用

**1. 启动后端**

```bash
cd backend
uv run main.py
```
后端将在 http://localhost:3002 运行（Docker 中默认 3000）。

**2. 启动前端**

```bash
cd frontend
pnpm run dev
```
前端将在 http://localhost:5173 运行。

## 🐳 Docker 部署（推荐）

本项目已完全容器化，支持一键部署。

### 1. 准备环境

确保服务器已安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)。

### 2. 配置环境变量

在 `backend` 目录下创建 `.env` 文件（可参考 `.env.example`）：

```bash
# 必需：设置 API Key
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# 可选：如果使用 DeepSeek
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### 3. 启动服务

在项目根目录下运行：

```bash
docker-compose up --build -d
```

### 4. 访问应用

服务启动后，访问 `http://localhost:8080` (或服务器 IP:8080) 即可使用。

- 前端：`http://localhost:8080`
- 后端 API：`http://localhost:8080/api` (由 Nginx 代理转发)

### 5. 数据持久化

所有数据（数据库文件）会自动保存在项目根目录下的 `./data` 文件夹中。即使删除容器，数据也不会丢失。

### 6. 更新部署

如果代码有更新，只需拉取最新代码并重启：

```bash
git pull
docker-compose up --build -d
```

## 🎯 功能演示

1. **会话持久化**：刷新页面或重启浏览器，您的聊天记录依然保留。
2. **URL 分享**：复制 `/chat/uuid-xxx` 的链接，可以在新标签页直接打开特定会话。
3. **历史记录**：在历史页面查看所有过往会话，支持删除。

## 🤝 贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目基于 MIT 许可证开源。
