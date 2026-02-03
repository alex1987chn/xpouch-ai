# XPouch AI v3.0

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Python 3.13+](https://img.shields.io/badge/Python-3.13+-blue.svg)](https://www.python.org/downloads/)
[![React 18](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)

> **Infinite Minds. One Pouch.**
> 
> 基于 LangGraph 的智能对话与任务协作平台，采用工业美学设计，支持多专家协作。

![XPouch AI Screenshot](https://github.com/user-attachments/assets/c4554212-e24e-47dd-a61d-8df4f69ce233)

XPouch AI v3.0 是一个基于 **LangGraph** 的智能对话与任务协作平台，采用前后端分离架构和 Bauhaus 工业美学设计。

## ✨ 核心特性

### 🧠 智能路由系统

**设计理念**：单入口智能路由，后端自动判断意图。

```
用户输入 → Router 节点 → Simple 或 Complex
                         ↓
              ┌─────────┴─────────┐
              ↓                   ↓
        直接 LLM 调用     LangGraph 工作流
        (thread_mode=      (thread_mode=
         'simple')          'complex')
```

| 模式 | 判断条件 | 执行方式 | 适用场景 |
|------|----------|----------|----------|
| **Simple** | 闲聊、常识、简单代码 | 直接调用 LLM | 日常问答、快速响应 |
| **Complex** | 需要联网、运行代码、深度分析 | 多专家协作 | 复杂任务、深度分析 |

**特点**：
- 前端无需手动切换模式
- 后端 Router 节点智能分类
- 同一入口 `sys-default-chat`，通过 `thread_mode` 区分

### 🎨 IndustrialChatLayout 双栏布局

```
┌─────────────────────────────────────────────────┐
│                   Header                         │
├────────────────────┬────────────────────────────┤
│                    │                            │
│  Chat Stream       │  Orchestrator Panel        │
│  Panel             │                            │
│  (55%)             │  ┌──────────┬──────────┐   │
│                    │  │  BusRail  │ Artifact │   │
│  - 消息列表        │  │  (专家)   │ (产物)   │   │
│  - 输入框          │  │          │          │   │
│  - 实时打字效果    │  └──────────┴──────────┘   │
│                    │                            │
└────────────────────┴────────────────────────────┘
           ↑                              ↑
        桌面端并排                   移动端切换
```

**布局特点**：
- **桌面端**：双栏并排显示
- **移动端**：单栏，底部切换按钮切换 Chat/Preview 视图
- **全屏模式**：Artifact 占满右侧区域

### 🤖 专家协作系统（Complex 模式）

仅在复杂模式下启用，7 位专业专家协同工作：

| 专家 | 类型 | 职责 |
|------|------|------|
| search | 搜索专家 | 信息搜索与查询 |
| coder | 编程专家 | 代码编写与调试 |
| researcher | 研究专家 | 深度研究与调研 |
| analyzer | 分析专家 | 数据分析与推理 |
| writer | 写作专家 | 文案与内容创作 |
| planner | 规划专家 | 任务规划与方案 |
| image_analyzer | 图像分析专家 | 图片内容识别 |

**工作流程**：
1. **Router**：意图识别，区分 simple/complex
2. **Planner**：任务拆解，生成执行计划
3. **Expert Dispatcher**：分发任务到专家
4. **Experts**：并行/串行执行子任务
5. **Aggregator**：整合结果，生成最终响应

### 📦 Artifact 产物系统

支持多种类型产物的渲染和展示：

| 类型 | 说明 | 特性 |
|------|------|------|
| **Code** | 代码片段 | 语法高亮、复制功能 |
| **HTML** | HTML 预览 | iframe 实时渲染 |
| **Markdown** | 文档渲染 | 支持 GFM |
| **Search** | 搜索结果 | 结构化展示 |
| **Text** | 纯文本 | 格式化展示 |

### 🔐 用户认证与权限

**认证方式**：
- 手机验证码登录
- JWT Token 认证
- 自动 Token 刷新

**权限角色**（未来扩展）：
- USER：普通用户
- VIEW_ADMIN：查看管理员
- EDIT_ADMIN：编辑管理员
- ADMIN：完全管理员

### 🌍 国际化支持

支持三种语言：
- 简体中文（zh-CN）
- English（en-US）
- 日本語（ja-JP）

## 🛠️ 技术栈

### 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | UI 框架 |
| TypeScript | 5.7.2 | 类型系统 |
| React Router | 7.12.0 | 路由管理 |
| Vite | 7.3.1 | 构建工具 |
| Zustand | 5.0.10 | 状态管理 |
| Tailwind CSS | 3.4.17 | 原子化样式 |
| shadcn/ui + Radix UI | Latest | 无头组件库 |
| Framer Motion | 12.29.0 | 动画与交互 |
| Lucide React | 0.563.0 | 图标库 |
| React Markdown | 10.1.0 | Markdown 渲染 |
| Mermaid | 11.12.2 | 流程图渲染 |
| DOMPurify | 3.3.1 | HTML 安全净化 |
| Sentry | 10.36.0 | 错误监控 |

### 后端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.13+ | 后端语言 |
| FastAPI | 0.128.0+ | 异步 Web 框架 |
| Uvicorn | 0.40.0+ | ASGI 服务器 |
| LangGraph | 1.0.6+ | AI 工作流编排 |
| LangChain OpenAI | 1.1.7+ | LLM 集成 |
| SQLModel | 0.0.31+ | ORM 框架 |
| PostgreSQL | 15+ | 数据库 |
| psycopg | 3.x | PostgreSQL 驱动 |
| uv | Latest | Python 包管理器 |
| PyJWT | 2.8.0 | JWT 认证 |
| Passlib | 1.7.4 | 密码哈希 |

## 🏗️ 系统架构

```mermaid
graph TB
    subgraph Client["客户端"]
        Browser["浏览器"]
        Mobile["移动端 PWA"]
    end

    subgraph Frontend["前端 (React + Vite)"]
        Router["React Router 7"]
        Layouts["IndustrialChatLayout"]
        Pages["页面组件"]
        Components["UI 组件"]
        Store["Zustand 状态管理"]
        Hooks["自定义 Hooks"]
        Services["API 服务层"]
        I18n["国际化"]

        Router --> Layouts
        Layouts --> Pages
        Pages --> Components
        Pages --> Hooks
        Hooks --> Store
        Pages --> Services
        Services --> I18n
    end

    subgraph Backend["后端 (FastAPI + Python)"]
        API["RESTful API"]
        Auth["认证模块"]
        Chat["聊天模块"]
        Agents["智能体模块"]

        API --> Auth
        API --> Chat
        API --> Agents
    end

    subgraph LangGraph["LangGraph 工作流"]
        Router["Router 节点"]
        Planner["Planner 节点"]
        Dispatcher["专家分发器"]
        Experts["7 位专家节点"]
        Aggregator["聚合器节点"]

        Router --> |simple| DirectReply
        Router --> |complex| Planner
        Planner --> Dispatcher
        Dispatcher --> Experts
        Experts --> Aggregator
    end

    subgraph Database["数据层"]
        PostgreSQL["PostgreSQL 15+"]
        Cache["专家配置缓存"]
    end

    subgraph LLM["LLM 服务"]
        OpenAI["OpenAI GPT-4o"]
        DeepSeek["DeepSeek Chat"]
    end

    Client --> Frontend
    Frontend --> |HTTP/SSE| Backend
    Backend --> LangGraph
    Backend --> Database
    LangGraph --> LLM
```

## 📦 项目结构

```
xpouch-ai/
├── frontend/                          # 🌐 React 前端应用
│   ├── src/
│   │   ├── components/                # React 组件
│   │   │   ├── layout/                # 布局组件
│   │   │   │   ├── IndustrialChatLayout.tsx  # 双栏布局容器
│   │   │   │   ├── OrchestratorPanelV2.tsx   # 编排器面板
│   │   │   │   └── ExpertRail/                # 专家状态栏
│   │   │   │       └── BusRail.tsx
│   │   │   ├── chat/                  # 聊天相关组件
│   │   │   │   ├── ChatStreamPanel.tsx
│   │   │   │   └── IndustrialHeader.tsx
│   │   │   ├── artifacts/             # Artifact 组件
│   │   │   │   ├── CodeArtifact.tsx
│   │   │   │   ├── DocArtifact.tsx
│   │   │   │   ├── HtmlArtifact.tsx
│   │   │   │   └── SearchArtifact.tsx
│   │   │   ├── bauhaus/               # Bauhaus 风格组件
│   │   │   ├── settings/              # 设置组件
│   │   │   └── ui/                    # shadcn/ui 基础组件
│   │   ├── pages/                     # 页面组件
│   │   │   ├── home/                  # 首页
│   │   │   ├── chat/                  # 统一聊天页
│   │   │   ├── history/               # 历史记录
│   │   │   ├── knowledge/             # 知识库
│   │   │   # 智能体管理
│   │   │   └── admin/                 # 管理后台
│   │   ├── providers/                 # Provider 组件
│   │   └── agent/                     # Agent 相关
│   │   ├── store/                     # Zustand 状态管理
│   │   │   ├── chatStore.ts           # 对话状态
│   │   │   ├── taskStore.ts           # 任务状态
│   │   │   └── userStore.ts           # 用户状态
│   │   ├── hooks/                     # 自定义 Hooks
│   │   │   └── useChat.ts             # 聊天逻辑
│   │   ├── services/                  # API 服务层
│   │   │   ├── api.ts                 # API 客户端
│   │   │   └── chat.ts                # 聊天 API
│   │   ├── utils/                     # 工具函数
│   │   ├── i18n/                      # 国际化
│   │   ├── constants/                 # 常量定义
│   │   │   └── agents.ts              # 智能体常量
│   │   ├── types/                     # TypeScript 类型
│   │   ├── router.tsx                 # 路由配置
│   │   ├── main.tsx                   # 应用入口
│   │   └── index.css                  # 全局样式
│   ├── public/                        # 静态资源
│   ├── nginx.conf                     # Nginx 配置
│   ├── package.json                   # NPM 依赖
│   ├── tsconfig.json                  # TypeScript 配置
│   ├── vite.config.ts                 # Vite 配置
│   └── Dockerfile                     # Docker 镜像
│
├── backend/                           # 🔧 Python 后端
│   ├── agents/                        # LangGraph 智能体
│   │   ├── graph.py                   # 工作流定义
│   │   ├── expert_loader.py           # 专家配置加载器
│   │   ├── dynamic_experts.py         # 动态专家节点
│   │   └── experts.py                 # 专家池实现
│   ├── routers/                       # 路由模块
│   │   ├── chat.py                    # 聊天 API
│   │   ├── agents.py                  # 智能体 API
│   │   └── system.py                  # 系统 API
│   ├── crud/                          # 数据访问层
│   ├── utils/                         # 工具模块
│   │   ├── llm_factory.py             # LLM 工厂
│   │   ├── json_parser.py             # JSON 解析器
│   │   ├── exceptions.py              # 自定义异常
│   │   └── event_generator.py         # 事件生成器
│   ├── migrations/                    # 数据库迁移
│   │   ├── apply_all_migrations.sql   # 统一迁移脚本
│   │   └── run_migration.sh           # 迁移执行脚本
│   ├── scripts/                       # 脚本目录
│   │   └── init_experts.py            # 专家初始化脚本
│   ├── models.py                      # SQLModel 数据模型
│   ├── database.py                    # 数据库连接
│   ├── config.py                      # 配置管理
│   ├── constants.py                   # 常量定义
│   ├── main.py                        # FastAPI 入口
│   ├── pyproject.toml                 # Python 项目配置
│   ├── .env.example                   # 环境变量示例
│   └── Dockerfile                     # Docker 镜像
│
├── data/                              # 数据目录
├── pnpm-workspace.yaml                # pnpm workspace 配置
├── docker-compose.yml                 # Docker 编排配置
├── deploy.sh                          # 部署脚本
├── CHANGELOG.md                       # 更新日志
└── README.md                          # 项目文档
```

## 🚀 快速开始

### Docker 部署（推荐）

**1. 克隆项目**

```bash
git clone https://github.com/alex1987chn/xpouch-ai.git
cd xpouch-ai
```

**2. 配置环境变量**

```bash
cp backend/.env.example backend/.env
vim backend/.env
```

必填配置：
```env
# LLM API Key（至少配置一个）
DEEPSEEK_API_KEY=sk-your-deepseek-key

# PostgreSQL 连接
DATABASE_URL=postgresql+psycopg://user:password@host:port/dbname

# JWT 密钥（生产环境请修改）
JWT_SECRET_KEY=your-secure-random-key
```

**3. 执行数据库迁移**

```bash
cd backend
chmod +x migrations/run_migration.sh
./migrations/run_migration.sh
```

**4. 启动服务**

```bash
docker-compose up --build -d
```

**5. 访问应用**

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:8080 |
| 后端 API | http://localhost:8080/api |
| API 文档 | http://localhost:8080/docs |

### 本地开发

**前置要求**

- Node.js >= 18.0.0
- Python >= 3.13
- PostgreSQL 15+
- pnpm >= 8.0.0

**1. 安装依赖**

```bash
pnpm install
```

**2. 配置环境变量**

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env
```

**3. 启动服务**

```bash
# 启动前后端（并发运行）
pnpm run dev

# 或分别启动
pnpm run dev:frontend  # 前端 http://localhost:5173
pnpm run dev:backend   # 后端 `cd backend && uv run main.py`，端口 http://localhost:3002
```

## 📖 使用指南

### 简单对话

1. 在首页输入框中输入问题
2. 后端 Router 自动判断为简单模式
3. 获得即时响应

### 复杂任务协作

1. 在首页输入复杂需求（如"调研前端技术趋势"）
2. 后端 Router 自动判断为复杂模式
3. Planner 拆解任务为多个子任务
4. 各专家协同执行
5. 查看右侧面板的专家进度和 Artifact 产物

### 创建自定义智能体

1. 点击首页"创建智能体"按钮
2. 填写智能体配置：
   - 名称和描述
   - 系统提示词
   - 选择模型
   - 选择分类
3. 保存后即可使用

## 🔧 配置说明

### 后端配置（backend/.env）

| 变量 | 说明 | 必需 | 默认值 |
|------|------|------|--------|
| `PORT` | 服务端口 | 否 | `3002` |
| `DATABASE_URL` | PostgreSQL 连接串 | 是 | - |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | 是* | - |
| `OPENAI_API_KEY` | OpenAI API 密钥 | 是* | - |
| `JWT_SECRET_KEY` | JWT 密钥 | 是 | - |

> * 至少需要配置一个 LLM 提供商的 API 密钥

### 前端配置（frontend/.env）

| 变量 | 说明 | 必需 | 默认值 |
|------|------|------|--------|
| `VITE_API_URL` | 后端 API 地址 | 否 | `/api` |

## 🧪 测试

```bash
# 前端单元测试
pnpm --prefix frontend run test

# 前端 lint
pnpm --prefix frontend run lint
```

## 📚 技术文档

- [CHANGELOG.md](./CHANGELOG.md) - 详细的更新日志
- [API 文档](http://localhost:3002/docs) - FastAPI Swagger 文档

## 🤝 贡献指南

我们欢迎所有形式的贡献！

详细贡献指南请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### 快速开始

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'feat: add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 打开 Pull Request 并描述更改内容

### 开发规范

- **代码风格**：遵循 ESLint 和 Prettier 配置
- **提交信息**：使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范
- **测试**：为新增功能编写单元测试
- **文档**：更新相关文档和 CHANGELOG

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

## 🔒 安全

如发现安全问题，请查看 [SECURITY.md](./SECURITY.md) 了解如何安全地报告漏洞。

## 📋 行为准则

参与本项目时，请遵守我们的 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 🙏 致谢

感谢以下开源项目：

- [LangGraph](https://github.com/langchain-ai/langgraph) - AI 工作流框架
- [shadcn/ui](https://ui.shadcn.com/) - 美观的 UI 组件库
- [Framer Motion](https://www.framer.com/motion/) - React 动画库
- [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS 框架
- [Radix UI](https://www.radix-ui.com/) - 无头 UI 组件
- [FastAPI](https://fastapi.tiangolo.com/) - 现代 Python Web 框架

## 📮 联系方式

- **仓库**：https://github.com/alex1987chn/xpouch-ai
- **问题反馈**：https://github.com/alex1987chn/xpouch-ai/issues

---

如果这个项目对你有帮助，请给我们一个 Star！⭐
