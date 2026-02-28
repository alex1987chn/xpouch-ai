# CHANGELOG

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2026-02-28] - v3.2.3 - 语义化主题系统重构

### 🎨 主题系统重构

**语义化设计令牌 (Design Tokens)**:
- 新增三层架构：Primitive → Semantic → Tailwind Mapping
- 定义了 40+ 语义化变量：surface-*, content-*, border-*, accent-*
- 支持透明度修饰符（如 `bg-surface-card/50`）

**简化主题策略**:
- 移除 Cyberpunk 和单独的 Bauhaus 主题
- 归并为 Light/Dark 两个主题（均为 Bauhaus 风格）
- Light: 暖灰纸张背景 + 黄色强调 + 黑色粗边框
- Dark: 深灰黑底 + 黄色边框/阴影 + 白色文字

**大规模组件更新**:
- 更新 30+ 文件，将旧颜色类替换为语义化变量
- 移除所有 `bauhaus-*` 前缀的类名
- 移除所有 `dark:` 前缀，通过 `data-theme` 属性控制

**兼容层保留**:
- 保留旧变量映射（`--bg-page`, `--border-color` 等）供迁移期使用
- 添加旧主题值迁移（`bauhaus` → `light`）

### ✅ 可复用性

**新增主题无需修改组件**:
```css
/* 只需在 themes/ 目录下新建主题文件 */
[data-theme="my-theme"] {
  --surface-page: 10 10 10;
  --surface-card: 20 20 20;
  --content-primary: 255 255 255;
  /* ... */
}
```

### 🔧 修复

- 修复主题切换时的闪烁问题
- 修复 placeholder 对比度不足
- 修复消息气泡颜色不统一
- 修复反选文字可见性

## [2026-02-28] - v3.2.2 - 代码质量重构与架构优化

### 🏗️ 架构重构

**后端 Service 层抽取**:
- 重构 `main.py`：业务逻辑迁移到 `services/invoke_service.py`
- `main.py` 从 ~500 行减少到 ~310 行
- 引入 FastAPI 依赖注入模式：`service: InvokeService = Depends(get_invoke_service)`
- 提升可测试性：Service 层可独立单元测试

**前端组件拆分**:
- `BauhausSidebar.tsx` (750行) 拆分为 7 个子组件
- `translations.ts` (1043行) 拆分为 6 个模块

### 🔧 代码质量 (P0/P1 修复)

**P0 严重问题修复 (9项)**:
- 修复 `useAsyncError` 不存在导出
- 修复 MCP transport 参数传递 bug
- 添加 ESLint 配置（React Hooks 规则）
- 修复 React 19 `forwardRef` 兼容性
- 修复 Zustand Slice 类型定义
- 修复 N+1 查询问题（TaskSession 预加载）
- 修复 SSRF 防护增强（MCP URL 验证）
- 提取 `formatTaskOutput` 公共函数

**P1 重要优化 (14项)**:
- Selector 统一：创建 `useAuthSelectors.ts`，删除重复定义
- Query 缓存配置：创建 `src/config/query.ts` 统一配置
- Suspense + ErrorBoundary 包装懒加载路由
- STREAM_TIMEOUT 从 30s 提升到 120s
- JSON Mode 智能降级（支持 DeepSeek 等模型）
- LangGraph deepcopy → list() 优化
- MCP 缓存键添加服务器配置哈希
- Vite 代码分割：11 个 manualChunks
- Prettier 配置添加 Tailwind CSS 插件
- TypeScript 配置统一（合并 tsconfig.app.json）

### 🐛 Bug 修复

**认证体验**:
- 修复未登录用户点击侧边栏资源库/历史记录不弹登录框的问题
- Sidebar `handleMenuClick` 添加登录检查
- Router 新增 `useRequireAuth` hook 保护 `/library` 和 `/history`

### 📦 工具链

**代码质量工具**:
- ESLint：React Hooks 规则（rules-of-hooks: error, exhaustive-deps: warn）
- Prettier：添加 `prettier-plugin-tailwindcss` 插件
- 格式化脚本：`format`, `format:check`

### 🔧 Dependencies

- **新增**: `tenacity>=9.0.0` (后端重试机制)
- **新增**: `cachetools>=5.3.0` (后端 TTL 缓存)
- **新增**: `prettier`, `prettier-plugin-tailwindcss` (前端)

## [2026-02-27] - v3.2.1 - MCP 增强与媒体渲染优化

### 🎉 新增功能

**MCP Streamable HTTP 支持**:
- 新增 `transport` 字段支持 `streamable_http` 协议（MCP 新标准，2025年3月发布）
- 向后兼容 SSE 协议（legacy，已弃用）
- 数据库迁移：`mcp_servers` 表新增 `transport` 列（默认 'sse'）

**MCP 工具超时与错误处理**:
- 添加 60 秒工具调用超时，防止外部 MCP 服务挂起
- 超时/错误时返回友好提示给 LLM，而非崩溃整个工作流
- 支持通义万相等长耗时服务（如视频生成）的优雅降级

**媒体内容自动渲染**:
- 自动识别并渲染 MCP 生成的图片/视频链接
- 支持 Markdown 链接 `[text](image.png)` 和行内代码 `` `image.png` `` 格式
- 支持 OSS 对象存储链接（阿里云、AWS S3 等）
- 添加链接过期检测和警告提示

### 🐛 Bug 修复

- 修复 MessageItem 和 DocArtifact 中的图片渲染逻辑
- 修复 ToolMessage content 兼容性问题（DeepSeek/MiniMax）

---

## [2026-02-27] - v3.2.0 - MCP 生态正式版 + 工业级认证

### 🎉 重大更新

**MCP 生态正式可用**:
- MCP 工具调用完整流程验证通过（高德地图等外部工具）
- 修复 ToolMessage content 格式问题，支持多模型兼容
- 生产环境稳定运行，可接入任意 MCP Server

**工业级自动认证机制**:
- 前端拦截器实现静默 Token 刷新
- 用户 60 天免登录体验
- 刷新失败时才弹出登录框，无缝衔接

### 🔐 安全与稳定性 (P0)

**JWT Token 安全重构 + 自动刷新**:
- 从 localStorage 迁移至 HttpOnly Cookie
- 移除 JWT 默认密钥，强制使用环境变量
- Access Token 过期时间从 30 天缩短至 60 分钟
- **新增自动 Token 刷新机制**：前端拦截器静默刷新，用户无感知
  - 拦截 401 错误 → 调用 `/auth/refresh-token` → 重试原请求
  - 刷新失败时才弹出登录框，实现 60 天免登录体验
- 新增 `AuthInitializer` 组件处理页面刷新后的会话恢复

**MCP 工具调用修复**:
- 修复 ToolMessage content 格式问题（DeepSeek/MiniMax 只接受字符串）
- 添加模型特定的 `content_mode` 配置（string/auto）
- 支持多模态模型（OpenAI/Anthropic/Gemini/Kimi）保留原生 list[str|dict] 格式

**MCP 连接安全**:
- 修复 MCP SSE 连接泄漏问题
- 添加 URL 验证（SSRF 防护）
- 使用 `HttpUrl` 类型严格验证 MCP Server URL
- 添加连接超时控制（10秒）

### ⚡ 性能优化 (P1)

**数据库性能**:
- 修复 N+1 查询问题（TaskSession/SubTask/Artifact 预加载）
- 使用 `selectinload` 优化关联数据查询

**LangGraph 优化**:
- 统一所有 Node 函数签名，添加 `config: RunnableConfig = None` 参数
- 修复 Node 间状态传递问题
- 添加专家缓存并发锁保护

**工具调用优化**:
- 添加异步工具版本 `asearch_web()`、`aread_webpage()`
- LLM 调用添加 `tenacity` 重试机制（3次指数退避）
- MCP 工具添加 TTL 缓存（5分钟）

**SSE 连接稳定性**:
- 修复重连计数器不重置问题
- 连接成功后正确重置 `retryCount` 和 `lastActivityTime`
- 优化心跳检测机制

### 🐛 Bug 修复

**Artifact 数据持久化**:
- 修复页面刷新后 Artifact 丢失问题
- 修复会话切换时 Artifact 显示混乱问题
- 修复 `tasksCache` 从 localStorage 恢复时的重建问题
- 优化 `useSessionRestore` 和 `loadConversation` 协调逻辑

**类型安全**:
- 清理 `router.tsx` 中的 `any` 类型
- 修复 `conversation: any`、`agent: any` 等类型定义
- 新增 `ApiError` 接口用于错误处理

### 📦 新增功能

**React 19 最佳实践 Hooks**:
- `useOptimisticUpdate` - 乐观更新模式
- `useSuspenseQuery` - Suspense 查询模式
- `usePromise` - React 19 `use()` 兼容层

**API 改进**:
- 智能体列表添加分页支持
- 统一错误处理增强

### 🔧 Dependencies

- **langgraph-sdk**: 升级至 0.3.5（从 0.3.3 升级）
  - 在 `pyproject.toml` 中显式声明依赖 `langgraph-sdk==0.3.5`
  - 更新 `requirements.txt` 锁定版本至 0.3.5
  - 更新 `uv.lock` 依赖锁定文件

---

## [2026-02-02] - v3.0.0 - 架构重构与开源发布

### 🎉 重大版本更新

**v3.0.0 是项目的首个正式稳定版本，标志着架构重构完成和开源发布。**

本版本经历了全面的架构重构，采用现代化的前后端分离 Monorepo 架构，实现了智能路由系统、LangGraph 多专家工作流、以及 IndustrialChatLayout 双栏布局。

### 🏗️ 架构重构

**Monorepo 架构**:
- 前端位于 `/frontend`（Vite + React 19 + TypeScript）
- 后端位于 `/backend`（FastAPI + Python 3.13 + SQLModel）
- 统一使用 pnpm workspace 管理多包依赖
- 使用 uv 作为 Python 包管理器

**前端架构**:
- React 19.2.4 + React Router 7.12.0 路由系统
- Zustand 5.0.10 全局状态管理
- shadcn/ui + Radix UI 无头组件库
- Tailwind CSS 3.4.17 原子化样式
- Framer Motion 12.29.0 动画与交互
- 响应式设计，支持移动端/平板/桌面端
- 完整的国际化支持（EN/ZH/JA）

**后端架构**:
- FastAPI 0.128.0 异步 Web 框架
- SQLModel 0.0.31 ORM 框架，统一 SQLAlchemy 和 Pydantic
- PostgreSQL 15+ 数据库（移除 SQLite 支持）
- LangGraph 1.0.6 AI 工作流编排
- JWT 认证 + 密码哈希（PyJWT + Passlib）

### ✨ 核心功能

**智能路由系统（Router）**:
- 单入口智能体 `sys-default-chat`（默认助手）
- 后端 Router 节点智能判断 simple/complex
- **Simple 模式**：直接调用 LLM 进行对话响应
- **Complex 模式**：LangGraph 多专家协作工作流
- 通过 `thread_mode` 字段区分模式（非独立智能体）
- 前端无需手动切换，体验更流畅

**LangGraph 工作流**:
- Router 节点：意图识别，只做分类决策
- Planner 节点：任务拆解，生成执行计划
- Expert Dispatcher：循环分发任务到对应专家节点
- 七位专业专家：search/coder/researcher/analyzer/writer/planner/image_analyzer
- Aggregator 节点：整合所有专家结果，生成最终响应
- SSE 实时推送任务进度和专家状态

**IndustrialChatLayout 双栏布局**:
- 左侧 ChatStreamPanel：消息列表 + 输入框（55% 宽度）
- 右侧 OrchestratorPanelV2：编排器面板
  - Simple 模式：AI 预览区域
  - Complex 模式：BusRail（专家状态）+ Artifact（产物展示）
- 桌面端双栏并排，移动端单栏切换
- 全屏模式：Artifact 占满右侧区域

**MCP 生态支持**:
- 原生支持 Model Context Protocol (MCP)
- MCP Server 管理：完整的 CRUD API
- Library 页面：Bauhaus 风格设计
- SSE 连接测试：添加/编辑时自动测试
- 工具动态注入：LangGraph 运行时加载 MCP 工具
- 工具优先级：MCP 专业工具 > 内置通用工具

**自定义智能体系统**:
- 用户可创建个性化 AI 助手
- 支持自定义系统提示词
- 支持选择不同模型
- 支持分类管理
- 默认助手不在列表展示，通过首页输入框直接交互

**Artifact 产物系统**:
- 代码片段：语法高亮、复制功能
- HTML 预览：iframe 实时渲染
- Markdown 文档：安全渲染、支持 GFM
- 搜索结果：结构化展示
- 多产物支持：一个专家可生成多个产物

**Human-in-the-Loop (HITL)**:
- Commander 生成任务计划后暂停等待用户确认
- 支持修改任务、调整顺序、删除步骤
- 完全掌控执行流程

**长期记忆**:
- 基于 pgvector 的向量检索
- 自动提取和存储用户偏好、习惯
- 实现个性化 AI 体验

### 📊 数据库模型

**核心模型**:
- User：用户账户，支持多种登录方式
- Thread：会话记录，关联用户和消息
- Message：消息记录，支持 extra_data 存储额外信息
- CustomAgent：用户自定义智能体

**复杂模式模型**:
- TaskSession：任务会话，记录一次完整的多专家协作过程
- SubTask：子任务，专家执行的具体任务
- Artifact：产物，支持多类型产物存储

**管理系统模型**:
- SystemExpert：系统专家配置（Prompt、模型、温度参数）
- MCPServer：MCP Server 配置管理

### 🔧 技术改进

**代码质量提升**:
- TypeScript 严格类型检查
- Pydantic 模型验证
- 单一职责原则，模块化设计
- 自定义异常类：AppError/NotFoundError/ValidationError/AuthorizationError
- 统一的错误处理装饰器：withErrorHandler

**性能优化**:
- Zustand 状态管理，组件逻辑与视图分离
- React.memo 和 useMemo 优化渲染性能
- 懒加载路由，代码分割
- 专家配置内存缓存
- Zustand Slice 严格隔离
- Services 层 Barrel 模式

**安全性增强**:
- CORS 白名单配置
- 安全头部中间件
- JWT Token 认证
- 密码 bcrypt 哈希
- API 权限检查
- HttpOnly Cookie（v3.1.0）

### 🎨 UI/UX 改进

**视觉设计**:
- Bauhaus 风格设计语言
- 粒子网格动态背景
- 流畅的动画过渡
- 深色/浅色主题支持

**用户体验**:
- 实时打字效果和流式响应
- 专家状态实时更新
- 任务进度可视化
- 移动端手势交互
- 滑动返回功能

### 📦 依赖更新

**前端依赖**:
- Vite 5.4.17 → 7.3.1
- React 19.2.4
- TypeScript 5.6 → 5.7.2
- Framer Motion 11.15.0 → 12.29.0
- Lucide React 0.462.0 → 0.563.0
- React Markdown 10.1.0
- Sentry 错误监控集成

**后端依赖**:
- Python 3.13+
- FastAPI 0.128.0+
- LangGraph 1.0.6+
- SQLModel 0.0.31+
- psycopg 3.x
- langchain-mcp-adapters 0.2.1

**开发工具**:
- pnpm 10.28.1
- uv 包管理器
- Docker + Docker Compose

### 🐛 问题修复

**已修复的关键问题**:
- 修复专家完成事件显示空括号问题
- 修复复杂模式下任务计划展示逻辑
- 修复自定义智能体消息不显示问题
- 修复 Artifact 状态在切换会话时残留问题
- 修复专家状态栏在明亮主题下的文本对比度问题
- 修复移动端滑动返回冲突问题
- 修复侧边栏菜单状态同步问题

### 📝 文档更新

**文档改进**:
- 完整的 README.md 文档，包含架构说明、部署指南、使用教程
- CHANGELOG.md 详细的版本更新记录
- 国际化翻译文件（EN/ZH/JA）
- Docker 部署配置和 Nginx 配置
- 环境变量配置说明
- CODE_REVIEW_REPORT.md 代码审查报告

### 🔒 生产环境准备

**部署优化**:
- Docker Compose 一键部署
- PostgreSQL 数据库容器化
- 前端静态资源 Nginx 托管
- 后端容器健康检查
- 数据库迁移脚本（幂等性设计）
- CORS 和安全头部配置

### 📊 代码统计

- 前端文件：135+ 个文件
- 后端文件：44+ 个文件
- 代码行数：约 20000+ 行

---

## 归档

更早期的版本变更记录请查看 [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)
