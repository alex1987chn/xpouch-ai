# XPouch AI v3.0

[![License](https://img.shields.io/badge/License-Apache%202.0%20with%20Additional%20Terms-blue.svg)](./LICENSE)
[![Python 3.13+](https://img.shields.io/badge/Python-3.13+-blue.svg)](https://www.python.org/downloads/)
[![React 18](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)

> **Infinite Minds. One Pouch.**
> 
> 基于 LangGraph 的智能对话与任务协作平台，采用工业美学设计，支持多专家协作。

![XPouch AI Screenshot](https://github.com/user-attachments/assets/c4554212-e24e-47dd-a61d-8df4f69ce233)

XPouch AI v3.0 是一个基于 **LangGraph** 的智能对话与任务协作平台，采用前后端分离架构和 Bauhaus 工业美学设计。

## ✨ 核心特性

### 🧠 智能路由系统

**设计理念**：双入口设计 + 单路由智能分发。

```
        ┌─────────────────────────────────┐
        │     入口 1: API 直接调用     │
        │  (Direct Mode - 单专家)       │
        └────────┬────────────────────────┘
                 │
                 ▼
            ┌─────────┐
            │ Generic  │───→ API Response
            │ Worker  │
            └─────────┘

        ┌─────────────────────────────────┐
        │   入口 2: 智能工作流      │
        │  (Agent Mode - 多专家协作)     │
        └────────┬────────────────────────┘
                 │
                 ▼
            ┌────────┐
            │ Router │───→ Simple Chat?
            └───┬───┘
                │
        ┌───────┴───────┐
        ↓               ↓
   直接 LLM 调用   LangGraph 工作流
   (闲聊/简单)      (复杂任务/多专家)
```

| 模式 | 入口 | 判断条件 | 执行方式 | 适用场景 |
|------|------|----------|----------|----------|
| **Direct** | API (`/api/agents`) | 指定 `agent_id` | 单个专家直接调用 | API 集成、单个专家任务 |
| **Simple** | 工作流 (`Router`) | 意图识别为闲聊 | 轻量级 LLM 调用 | 日常问答、闲聊 |
| **Complex** | 工作流 (`Router`) | 意图识别为复杂 | LangGraph 多专家协作 | 复杂任务、深度分析 |

**特点**：
- **双入口设计**：API 直接调用 + 工作流智能路由
- **配置驱动**：所有专家从数据库加载，支持热更新
- **去工厂化**：删除硬编码专家映射，动态加载
- **统一执行**：API 和工作流都使用 `Generic Worker` 执行

### 🎨 IndustrialChatLayout 双栏布局

```
┌─────────────────────────────────────────────────┐
│                   Header                         │
├────────────────────┬────────────────────────────┤
│                    │                            │
│  Chat Stream       │  Orchestrator Panel        │
│  Panel             │                            │
│  (45%)             │  ┌──────────┬──────────┐   │
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

### 🤖 专家协作系统（Agent 模式）

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
2. **Commander**：任务拆解，生成执行计划（调用 TaskManager）
3. **Dispatcher**：检查专家存在，验证配置（调用 ExpertManager）
4. **Generic Worker**：执行专家任务，自动递增 index，实时保存结果（调用 TaskManager）
5. **Loop**：重复 Dispatcher → Generic，直到所有任务完成
6. **Aggregator**：整合结果，生成最终响应

**服务层抽象**：
- **ExpertManager**：专家配置管理（数据库 → 缓存），提供动态加载和模型兜底
- **TaskManager**：任务会话管理（TaskSession/SubTask），集中所有数据库操作
- **设计原则**：Node 代码只关注业务逻辑，数据读写由 Services 层统一管理

**执行闭环**：
- Generic Worker 每次执行任务后，`current_index` 自动 +1
- 回到 Dispatcher 检查是否还有任务
- 有任务 → 继续 Generic Worker
- 无任务 → 去 Aggregator 聚合结果
- 即使任务失败，index 也会递增，确保流程不会卡死

**动态专家注入**：
- 支持运行时动态添加自定义专家
- 专家配置（Prompt、模型参数）持久化到数据库，支持热更新
- 所有专家通过数据库驱动，删除硬编码工厂函数
- 新增专家无需重启服务，立即可用

**专家链式信息传递**：
- 支持任务间的显式依赖关系（`depends_on`）
- 下游专家自动获取上游专家的输出结果作为上下文
- 实现多步骤复杂任务的流水线执行

```
用户查询: "先搜索2024年销量最高的电动车，然后分析它的电池技术"
                ↓
Commander 生成任务计划:
┌─────────────────────────────────────────────────────────────┐
│ Task 0: search - 搜索2024年销量最高的电动车型号              │
│ Task 1: analyzer - 分析该车型的电池技术 (depends_on: Task 0)│
└─────────────────────────────────────────────────────────────┘
                ↓
Task 0 执行完成 → 输出结果注入到 Task 1 的上下文
                ↓
Task 1 基于 Task 0 的输出执行分析
                ↓
Aggregator 整合所有结果生成最终响应
```

### 📦 Artifact 产物系统（3 Core Types 架构）

采用**三剑客架构**，通过语言识别实现智能渲染：

| 类型 | 说明 | 支持的语言/格式 | 特性 |
|------|------|----------------|------|
| **Code** | 代码/图表/流程图 | python, js, ts, mermaid, json-chart... | 语法高亮 + 智能渲染 |
| **Markdown** | 文档渲染 | md, gfm | 完整 Markdown 支持 |
| **HTML** | 网页预览 | html, htm | iframe 安全渲染 |

**智能渲染逻辑**：
- `CodeArtifact` 作为智能中枢，根据 `language` 字段自动分发：
  - `mermaid` → 流程图渲染
  - `json-chart` → 图表渲染（柱状/折线/饼图）
  - 其他代码 → PrismJS 语法高亮
- 支持源码/预览切换
- 多代码块时优先展示可视化内容

### 🔐 用户认证与权限

**认证方式**：
- 手机验证码登录
- JWT Token 认证
- 自动 Token 刷新

**权限角色**（已实现）：
- USER：普通用户（无管理权限）
- VIEW_ADMIN：查看管理员（可查看专家配置）
- EDIT_ADMIN：编辑管理员（可修改专家配置）
- ADMIN：完全管理员（可升级用户、完全控制）

**权限控制**：
- 后端：FastAPI 依赖注入进行 API 权限检查
- 前端：React Router 路由鉴权（AdminRoute 组件）
- 数据库：PostgreSQL ENUM 类型存储用户角色
- 专家管理页面：仅 admin 角色可访问

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
| Recharts | 2.15.0 | 图表渲染（柱状/折线/饼图）|
| PrismJS | 1.29.0 | 代码语法高亮 |
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
        Auth["认证模块 (JWT)"]
        Chat["聊天模块"]
        Agents["智能体模块"]
            Services["Services 服务层"]
            Nodes["Nodes 节点"]
        Admin["管理员模块"]
        CRUD["数据访问层 (CRUD)"]
        Utils["工具模块"]
        Models["数据模型"]
        Config["配置管理"]
        Constants["常量定义"]

        API --> Auth
        API --> Chat
        API --> Agents
        API --> Admin
        Agents --> Services
        Services --> Nodes
        Services --> CRUD
        Services --> Utils
        Services --> Config
        CRUD --> Models
    end

    subgraph LangGraph["LangGraph 工作流"]
        Router["Router 节点 (意图识别)"]
        Commander["Commander 节点 (任务规划)"]
        Dispatcher["Dispatcher 节点 (检查专家存在)"]
        Generic["Generic Worker 节点 (统一执行)"]
        Aggregator["Aggregator 节点 (结果聚合)"]

        Router --> |simple| DirectReply
        Router --> |complex| Commander
        Commander --> Dispatcher
        Dispatcher --> |专家存在| Generic
        Generic --> |Loop| Dispatcher
        Generic --> |Done| Aggregator
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
│   │   │   ├── artifacts/             # Artifact 组件（3 Core Types 架构）
│   │   │   │   ├── CodeArtifact.tsx       # 💻 代码/图表/流程图（智能中枢）
│   │   │   │   ├── DocArtifact.tsx        # 📄 Markdown 文档渲染
│   │   │   │   ├── HtmlArtifact.tsx       # 🌐 HTML 预览
│   │   │   │   └── renderers/             # 渲染器子目录
│   │   │   │       ├── MermaidRenderer.tsx    # 流程图渲染
│   │   │   │       └── ChartRenderer.tsx      # 图表渲染（bar/line/pie）
│   │   │   ├── bauhaus/               # Bauhaus 风格组件
│   │   │   │   └── BauhausSidebar.tsx  # 侧边栏（含 admin 入口）
│   │   │   ├── settings/              # 设置组件
│   │   │   └── ui/                    # shadcn/ui 基础组件
│   │   ├── AdminRoute.tsx             # 路由鉴权组件（支持细粒度权限）
│   │   ├── pages/                     # 页面组件
│   │   │   ├── home/                  # 首页
│   │   │   ├── chat/                  # 统一聊天页
│   │   │   ├── history/               # 历史记录
│   │   │   ├── knowledge/             # 知识库
│   │   │   └── admin/                 # 管理后台
│   │   │       └── ExpertAdminPage.tsx  # 专家管理页面
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
│   │   ├── services/                  # 业务服务层
│   │   │   ├── expert_manager.py     # 专家配置管理（数据库 → 缓存）
│   │   │   └── task_manager.py      # 任务会话管理（TaskSession/SubTask）
│   │   ├── graph.py                   # 工作流图构建
│   │   ├── state.py                   # AgentState 类型定义
│   │   └── nodes/                     # 工作流节点实现
│   │       ├── router.py              # 意图识别节点
│   │       ├── commander.py           # 任务规划节点
│   │       ├── dispatcher.py          # 专家分发节点
│   │       ├── aggregator.py          # 结果聚合节点
│   │       └── generic.py             # 通用专家执行节点
│   ├── api/                           # API 路由
│   │   └── admin.py                   # 管理员 API（专家配置）
│   ├── routers/                       # 路由模块
│   │   ├── chat.py                    # 聊天 API
│   │   ├── agents.py                  # 智能体 API
│   │   └── system.py                  # 系统 API
│   ├── crud/                          # 数据访问层
│   │   └── task_session.py            # TaskSession CRUD
│   ├── utils/                         # 工具模块
│   │   ├── llm_factory.py             # LLM 工厂
│   │   ├── json_parser.py             # JSON 解析器
│   │   ├── exceptions.py              # 自定义异常
│   │   └── event_generator.py         # 事件生成器
│   ├── migrations/                    # 数据库迁移
│   │   ├── apply_all_migrations.sql   # 统一迁移脚本
│   │   ├── README.md                # 迁移说明文档
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
3. Commander 拆解任务为多个子任务
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

本项目采用 **Apache License 2.0 + 附加条款** 开源。

### 许可证要点

| 使用场景 | 是否允许 | 说明 |
|----------|----------|------|
| **内部部署** | ✅ 允许 | 企业内部使用完全免费 |
| **单一客户部署** | ✅ 允许 | 外包公司为客户单独部署 |
| **SaaS 云服务** | ❌ 禁止 | 不得作为多租户服务提供给第三方 |
| **修改 Logo** | ❌ 禁止 | 不得移除或修改界面中的 XPouch 品牌标识 |

详细许可证内容请参阅 [LICENSE](./LICENSE) 文件。

### 商业授权

如需商业 SaaS 授权或品牌定制，请联系项目维护者。

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
