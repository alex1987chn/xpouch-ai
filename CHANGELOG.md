# CHANGELOG

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 🔧 Dependencies

- **langgraph-sdk**: 升级至 0.3.5（从 0.3.3 升级）
  - 在 `pyproject.toml` 中显式声明依赖 `langgraph-sdk==0.3.5`
  - 更新 `requirements.txt` 锁定版本至 0.3.5
  - 更新 `uv.lock` 依赖锁定文件

## [2026-02-02] - v3.0.0 - 架构重构与开源发布

### 🎉 重大版本更新

**v3.0.0 是项目的首个正式稳定版本，标志着架构重构完成和开源发布。**

本版本经历了全面的架构重构，采用现代化的前后端分离 Monorepo 架构，实现了智能路由系统、LangGraph 多专家工作流、以及 IndustrialChatLayout 双栏布局。

### 🏗️ 架构重构

**Monorepo 架构**：
- 前端位于 `/frontend`（Vite + React 18 + TypeScript）
- 后端位于 `/backend`（FastAPI + Python 3.13 + SQLModel）
- 统一使用 pnpm workspace 管理多包依赖
- 使用 uv 作为 Python 包管理器

**前端架构**：
- React 18.3.1 + React Router 7.12.0 路由系统
- Zustand 5.0.10 全局状态管理
- shadcn/ui + Radix UI 无头组件库
- Tailwind CSS 3.4.17 原子化样式
- Framer Motion 12.29.0 动画与交互
- 响应式设计，支持移动端/平板/桌面端
- 完整的国际化支持（EN/ZH/JA）

**后端架构**：
- FastAPI 0.128.0 异步 Web 框架
- SQLModel 0.0.31 ORM 框架，统一 SQLAlchemy 和 Pydantic
- PostgreSQL 15+ 数据库（移除 SQLite 支持）
- LangGraph 1.0.6 AI 工作流编排
- JWT 认证 + 密码哈希（PyJWT + Passlib）

### ✨ 核心功能

**智能路由系统（Router）**：
- 单入口智能体 `sys-default-chat`（默认助手）
- 后端 Router 节点智能判断 simple/complex
- **Simple 模式**：直接调用 LLM 进行对话响应
- **Complex 模式**：LangGraph 多专家协作工作流
- 通过 `thread_mode` 字段区分模式（非独立智能体）
- 前端无需手动切换，体验更流畅

**LangGraph 工作流**：
- Router 节点：意图识别，只做分类决策
- Planner 节点：任务拆解，生成执行计划
- Expert Dispatcher：循环分发任务到对应专家节点
- 七位专业专家：search/coder/researcher/analyzer/writer/planner/image_analyzer
- Aggregator 节点：整合所有专家结果，生成最终响应
- SSE 实时推送任务进度和专家状态

**IndustrialChatLayout 双栏布局**：
- 左侧 ChatStreamPanel：消息列表 + 输入框（55% 宽度）
- 右侧 OrchestratorPanelV2：编排器面板
  - Simple 模式：AI 预览区域
  - Complex 模式：BusRail（专家状态）+ Artifact（产物展示）
- 桌面端双栏并排，移动端单栏切换
- 全屏模式：Artifact 占满右侧区域

**自定义智能体系统**：
- 用户可创建个性化 AI 助手
- 支持自定义系统提示词
- 支持选择不同模型
- 支持分类管理
- 默认助手不在列表展示，通过首页输入框直接交互

**Artifact 产物系统**：
- 代码片段：语法高亮、复制功能
- HTML 预览：iframe 实时渲染
- Markdown 文档：安全渲染、支持 GFM
- 搜索结果：结构化展示
- 多产物支持：一个专家可生成多个产物

### 📊 数据库模型

**核心模型**：
- User：用户账户，支持多种登录方式
- Thread：会话记录，关联用户和消息
- Message：消息记录，支持 extra_data 存储额外信息
- CustomAgent：用户自定义智能体

**复杂模式模型**：
- TaskSession：任务会话，记录一次完整的多专家协作过程
- SubTask：子任务，专家执行的具体任务
- Artifact：产物，支持多类型产物存储

**管理系统模型**：
- SystemExpert：系统专家配置（Prompt、模型、温度参数）

### 🔧 技术改进

**代码质量提升**：
- TypeScript 严格类型检查
- Pydantic 模型验证
- 单一职责原则，模块化设计
- 自定义异常类：AppError/NotFoundError/ValidationError/AuthorizationError
- 统一的错误处理装饰器：withErrorHandler

**性能优化**：
- Zustand 状态管理，组件逻辑与视图分离
- React.memo 和 useMemo 优化渲染性能
- 懒加载路由，代码分割
- 专家配置内存缓存

**安全性增强**：
- CORS 白名单配置
- 安全头部中间件
- JWT Token 认证
- 密码 bcrypt 哈希
- API 权限检查

### 🎨 UI/UX 改进

**视觉设计**：
- Bauhaus 风格设计语言
- 粒子网格动态背景
- 流畅的动画过渡
- 深色/浅色主题支持

**用户体验**：
- 实时打字效果和流式响应
- 专家状态实时更新
- 任务进度可视化
- 移动端手势交互
- 滑动返回功能

### 📦 依赖更新

**前端依赖**：
- Vite 5.4.17 → 7.3.1
- React 18.3.1
- TypeScript 5.6 → 5.7.2
- Framer Motion 11.15.0 → 12.29.0
- Lucide React 0.462.0 → 0.563.0
- React Markdown 10.1.0
- Sentry 错误监控集成

**后端依赖**：
- Python 3.13+
- FastAPI 0.128.0+
- LangGraph 1.0.6+
- SQLModel 0.0.31+
- psycopg 3.x

**开发工具**：
- pnpm 10.28.1
- uv 包管理器
- Docker + Docker Compose

### 🐛 问题修复

**已修复的关键问题**：
- 修复专家完成事件显示空括号问题
- 修复复杂模式下任务计划展示逻辑
- 修复自定义智能体消息不显示问题
- 修复 Artifact 状态在切换会话时残留问题
- 修复专家状态栏在明亮主题下的文本对比度问题
- 修复移动端滑动返回冲突问题
- 修复侧边栏菜单状态同步问题

### 📝 文档更新

**文档改进**：
- 完整的 README.md 文档，包含架构说明、部署指南、使用教程
- CHANGELOG.md 详细的版本更新记录
- 国际化翻译文件（EN/ZH/JA）
- Docker 部署配置和 Nginx 配置
- 环境变量配置说明

### 🔒 生产环境准备

**部署优化**：
- Docker Compose 一键部署
- PostgreSQL 数据库容器化
- 前端静态资源 Nginx 托管
- 后端容器健康检查
- 数据库迁移脚本（幂等性设计）
- CORS 和安全头部配置

### 📊 代码统计

- 前端文件：135 个文件
- 后端文件：44 个文件
- 代码行数：约 15000+ 行
- 提交次数：100+ 次
- 贡献者：1 人

### 🚀 升级说明

**从旧版本升级**：

1. 备份现有数据库
2. 拉取最新代码
3. 执行数据库迁移：
   ```bash
   cd backend
   ./migrations/run_migration.sh
   ```
4. 重新构建并启动 Docker 容器：
   ```bash
   docker-compose up --build -d
   ```

**兼容性说明**：
- v3.0.0 是全新架构，不兼容旧版本
- 如有重要数据，请先导出
- 数据库结构完全重构

---

## [2026-02-01] - v0.6.7 - 专家系统与Artifact展示优化

### 🚀 核心功能

**自动选中第一个专家**：
- 实现第一个专家完成时自动选中的逻辑
- 自动选中第一个artifact进行展示
- 用户无需手动点击即可看到生成内容
- 优化首次使用体验

### 🎨 UI 改进

**Artifact展示优化**：
- artifact标签高亮（当前选中状态）
- 预览窗口放大缩小功能
- 代码/HTML/搜索渲染优化
- 代码高亮和格式化改进

**对话框组件优化**：
- 创建DialogContentBauhaus变体（不含默认关闭按钮）
- 修复ExpertDetailModal重复关闭按钮问题
- 保持Bauhaus风格统一性

**专家状态栏优化**：
- 增强未高亮专家在明亮主题下的文本对比度
- 将pending状态文本从--text-muted改为--text-secondary
- 明亮主题下从#888888提升到#555555，更清晰易读

### 🔧 技术改进

**Router节点优化**：
- 添加tags=["router"]配置，过滤JSON输出
- 配合main.py的流式过滤逻辑
- 防止意图识别JSON在对话面板展示
- 提升用户界面的纯净度

### 📊 代码统计

- 修改文件：9个
- 前端：7个文件
- 后端：2个文件
- 核心优化：专家系统、Artifact展示、UI组件

### 🎯 用户体验提升

**优化前**：
- 需要手动点击专家和artifact才能看到内容
- 未高亮专家在明亮主题下难以辨认
- ExpertDetailModal有重复的关闭按钮
- 意图识别JSON可能出现在对话面板

**优化后**：
- 第一个专家完成时自动选中，立即展示内容
- 所有专家标签文本清晰可读
- 只显示一个Bauhaus风格的关闭按钮
- 对话面板只显示用户友好的AI回复

---

## [2026-01-31] - v0.6.6 - 前端智能路由全托管重构

### 🚀 核心重构

**移除手动模式切换，实现智能路由全托管**：
- 删除 SIMPLE/COMPLEX 模式切换按钮（首页 + 聊天页）
- 移除模式判断逻辑和状态管理
- 统一使用 Orchestrator 接口（后端自动路由）
- 前端根据后端响应自动展开右侧面板

### 🎨 UI 改进

**首页 (HomePage)**：
- 移除输入框下方的模式切换按钮
- 简化工具栏（只保留附件按钮）
- 推荐场景点击只设置输入内容，不改变模式

**聊天页 (UnifiedChatPage + ChatStreamPanel)**：
- 移除模式切换按钮和 ModeButton 组件
- 删除 `mode` 和 `onModeChange` props
- 监听专家活动，自动切换移动端视图模式

### 🔧 技术改进

**智能响应 (Auto-Layout)**：
- 监听 `expertResults` 和 `artifactSessions` 状态
- 检测到专家活动时：
  - 移动端：自动切换到 preview 模式
  - 桌面端：右侧面板自动展开
- 无需用户手动干预，体验更流畅

**代码清理**：
- 移除 `ConversationMode` 类型定义
- 移除 `conversationMode` 状态
- 移除 `handleModeChange` 函数
- 移除模式判断逻辑（`if (conversationMode === 'complex')`）

### 📊 代码统计

- 修改文件：3 个
- 代码变更：+28 行 / -137 行
- 净减少：-109 行
- 删除组件：ModeButton（完整删除）

### 🎯 用户体验提升

**修改前（手动模式切换）**：
- 用户需要手动选择 SIMPLE 或 COMPLEX 模式
- 增加用户认知负担
- 选错模式会导致体验不好

**修改后（智能路由全托管）**：
- 用户直接输入消息，后端自动判断意图
- 前端根据后端响应自动展开右侧面板
- 交互更简洁、体验更智能

---

## [2026-01-31] - v0.6.5 - 后端架构优化与代码质量提升

### 🏗️ 架构改进

**前端核心逻辑重构**：
- 将 `useChat.ts` 拆分为单一职责的子 Hooks：
  - `useChatCore`: 核心聊天逻辑（发送、停止、加载状态）
  - `useExpertHandler`: 专家事件处理（激活、完成、任务计划）
  - `useArtifactHandler`: Artifact 处理（创建、解析、恢复）
  - `useConversation`: 会话管理（加载、删除）
- 解耦路由逻辑（通过 `onNewConversation` 回调）
- 统一 UUID 生成（全部使用 `generateUUID()`）
- 优化 `useCallback` 依赖列表，避免闭包陷阱

**后端专家配置优化**：
- 将专家定义和提示词移至 `constants.py`：
  - 添加 `EXPERT_DESCRIPTIONS` 字典（专家描述）
  - 添加 `EXPERT_PROMPTS` 字典（专家提示词）
  - 保留原有 `COMMANDER_SYSTEM_PROMPT`
- `experts.py` 删除重复定义，改为从 `constants` 导入
- 实现数据库驱动的专家配置（数据库优先，硬编码回退）
- 修复 `task_list` 边界检查（防止 IndexError）
- 统一提示词格式化（添加 `\n\n` 换行符）

### 🔧 技术改进

**兼容性增强**：
- `graph.py` 路由节点改用 `PydanticOutputParser` + `format_instructions`
- 废弃 `with_structured_output()`（确保 DeepSeek/OpenAI 兼容）
- `AppError` 改为具名参数调用（`message=...`），避免位置参数歧义

**代码清理**：
- 删除 `canvasStore.ts` 中未使用的 `magicColor` 状态
- 删除后端 `commander.py`（旧版实现，已被 `graph.py` 替代）
- 删除 `utils/storage.ts` 中已废弃的 `ConversationHistory` 类型
- 硬编码文本抽离到翻译文件

### 📊 代码统计

- 前端重构：35 个文件变更（+1881 行，-1044 行）
- 后端优化：1 个文件变更（-281 行）
- 删除冗余代码：约 2100 行
- 文件结构更清晰，代码可维护性大幅提升

### 🎯 质量提升

| 维度 | 评分 | 说明 |
|--------|-------|-------|
| **架构设计** | ⭐⭐⭐⭐ | 单一职责，模块化清晰 |
| **代码复用** | ⭐⭐⭐⭐ | 统一导入，删除重复 |
| **类型安全** | ⭐⭐⭐⭐ | 类型守卫，移除 any |
| **兼容性** | ⭐⭐⭐⭐ | 通用 Parser，兼容所有模型 |
| **可维护性** | ⭐⭐⭐⭐ | 配置集中，逻辑清晰 |

---

## [2026-01-30] - v0.6.4 - 前端项目结构重组与优化

### 🏗️ 架构改进

**前端目录结构重组**：
- 创建 `src/pages/` 目录，将页面组件按功能分类
  - `pages/home/` - 首页相关
  - `pages/chat/` - 聊天相关
  - `pages/knowledge/` - 知识库相关
  - `pages/history/` - 历史记录相关
  - `pages/agent/` - 智能体相关
  - `pages/admin/` - 管理后台相关
- 将 `components/` 中的组件按功能移至子目录
  - `components/auth/` - 认证组件（LoginDialog）
  - `components/settings/` - 设置组件（SettingsDialog, PersonalSettingsDialog, DeleteConfirmDialog, LanguageSelector, ThemeSwitcher, ModelSelector）
  - `components/agent/` - 智能体组件（AgentCard, AgentPreviewCard, ArtifactPreviewCard, SwipeBackIndicator）
  - `components/chat/` - 聊天组件（ExpertStatusBar, IndustrialHeader, ExpertDetailModal）

### 🔧 技术改进

**Import 路径统一**：
- 所有 import 统一使用 `@/` 别名替代相对路径
- 更新 `main.tsx` 中的所有路由懒加载路径
- 更新所有受影响组件（AppLayout, UnifiedChatPage, HistoryPage, KnowledgeBasePage, CreateAgentPage, ExpertAdminPage, BauhausSidebar）的 import 引用
- 使用绝对路径提升代码可维护性

**I18n 翻译优化**：
- 删除英文翻译中的 3 个重复 key（`model`, `temperatureValue`, `characters`）
- 删除日文翻译中的 3 个重复 key
- 移除 `Delete Dialog` 部分不必要的 key（`model`, `temp`, `response`, `secondsAbbr`）
- 解决 Vite 编译时的 Duplicate key 警告
- 构建验证：无错误和警告

### 🎨 UI 改进

**最近会话显示优化**：
- 后端加载最近 **20 条**会话记录（之前 5 条）
- UI 区域高度调整为 **220px**，保持展示 **5 个**卡片（之前 160px）
- 超出部分可滚动查看，用户体验更佳
- Bauhaus 风格滚动条，视觉一致性

### 📊 代码统计

- 文件移动：20 个文件（15 个重命名至功能目录）
- 修改文件：4 个（AppLayout, BauhausSidebar, main.tsx, translations.ts）
- 代码变更：+27 行 / -39 行
- 优化效果：目录结构清晰，组件查找更便捷，代码可维护性大幅提升

---

## [2026-01-30] - v0.6.3 - 国际化优化与组件清理

### 🎨 UI 改进

**输入框巨型机器风格**：
- 首页和聊天页输入框placeholder统一为巨型机器风格文本
- 中文：// 准备装载...
- 英文：// AWAITING PAYLOAD...
- 日文：// 装填準備...
- 强调实体感，将AI视为巨型机器

### 🧹 代码清理

**废弃组件删除**：
- 移除不再使用的组件：AgentHeader, ArtifactTabs, ArtifactsArea, MessageBubble, MessageItem
- 移除废弃上下文：ToastContext, ArtifactProvider
- 移除废弃hooks：useArtifactListener, useExpertStream, useMagicColorParser, useTypewriter
- 移除其他废弃文件：plans.ts, icon-mapping.ts, loadingStore.ts, 3.0.0

**国际化优化**：
- CreateAgentPage 添加完整的国际化支持（47个翻译键）
- ExpertAdminPage 添加完整的国际化支持（25个翻译键）
- HomePage 优化UI和国际化实现（4个翻译键）
- UnifiedChatPage 统一聊天页面逻辑
- BauhausSidebar 优化样式
- ExpertDetailModal 添加国际化
- ChatStreamPanel 优化输入框和消息展示
- OrchestratorPanel 优化专家展示
- i18n/index.ts 更新翻译键定义

### 📊 代码统计

- 删除：15个废弃组件/文件（共1677行代码）
- 修改：9个核心组件（国际化优化）
- 新增：334行代码
- 新增翻译键：76个

---

## [2026-01-28] - v0.6.2 - 专家初始化脚本修复与指挥官配置优化

### 🐛 Bug 修复

**同步/异步不兼容问题**：
- 修复了 `init_experts.py` 中的致命同步/异步不兼容问题
- 自动检测数据库引擎类型（AsyncEngine 或同步引擎）
- 智能选择会话模式（AsyncSession 或 Session）
- 兼容 FastAPI + SQLModel 异步项目架构

### 🔧 技术改进

**专家初始化脚本安全模式**：
- 引入安全模式（默认）：仅创建缺失专家，不覆盖现有配置
- 添加更新模式（`--update`）：显式覆盖现有专家配置为默认值
- 命令行参数支持：`list`、`--safe`、`--help`
- 详细日志输出：显示创建/跳过/更新的专家信息

**指挥官配置动态加载**：
- 修改 `graph.py` 中的指挥官节点，从数据库加载配置
- 支持 `expert_key="commander"` 的独立模型和温度参数
- 降级策略：数据库无数据时自动使用硬编码提示词常量
- 日志输出：显示加载的配置来源和参数

### ✨ 功能增强

**指挥官专家集成**：
- 在 `init_experts.py` 中添加指挥官专家（commander）默认配置
- 使用 `constants.COMMANDER_SYSTEM_PROMPT` 作为默认系统提示词
- 模型：gpt-4o，温度：0.5，与其他专家配置保持一致
- 支持通过专家管理页面调整指挥官 Prompt 和参数

## [2026-01-27] - v0.6.1 - Bug 修复与 PostgreSQL 优化

### 🐛 Bug 修复

**登录对话框错误**：
- 修复了 `LoginDialog.tsx` 中 `errorHandler is not defined` 错误
- 改用 `logger.error()` 处理发送验证码失败的情况
- 优化了错误提示机制

**验证码发送失败**：
- 修复了创建用户时缺少 `role` 字段的问题
- 确保 `User` 模型创建时有默认角色值
- 解决了 `POST /api/auth/send-code` 返回 500 错误的问题

**UserRole 枚举映射错误**：
- 修复了 `AttributeError: 'str' object has no attribute 'value'` 错误
- 更新 `auth.py` 中的 `TokenResponse` 返回逻辑
- 使用 `str(user.role)` 替代 `user.role.value`
- 适配 SQLAlchemy String 类型映射

**翻译重复键警告**：
- 修复了 `translations.ts` 中重复的 `systemPrompt` 键
- 重命名 RBAC Expert Admin 部分的键为 `expertSystemPrompt`
- 解决了 Vite 编译时的 Duplicate key 警告

### 🔧 技术改进

**PostgreSQL 专有模式**：
- 完全移除 SQLite 支持（fallback 机制）
- 删除 `migrations/` 目录（SQLite 迁移脚本）
- 删除 `scripts/` 目录（数据库管理脚本）
- 简化 `database.py`（118 行 → 36 行）
- 强制要求 `DATABASE_URL` 环境变量
- 只支持 PostgreSQL 数据库

**UserRole 枚举映射优化**：
- 使用 SQLAlchemy `sa_column=Column(String(10))` 映射
- 保持数据库列为 `VARCHAR(10)` 类型
- Python 层自动转换 String ↔ Enum
- 避免 PostgreSQL Native ENUM 的 Alembic 迁移复杂性

**系统专家表修复**：
- 修复了 `SystemExpert` 模型主键定义错误
- 确保 `expert_key` 唯一索引正确设置

**导入和依赖修复**：
- 添加了 `getHeaders` 函数导出（utils/request）
- 添加了 `Toast` 组件和 `Toaster` 提供者
- 修复了迁移脚本类定义问题（`migration_003.py`）
- 调整了函数定义顺序解决 `NameError`
- 添加了 `HomePage.tsx` 缺少的 `logger` 导入

### 📊 数据库变更

**User 表 role 字段**：
- 类型：`VARCHAR(10)`（保持不变）
- 默认值：`'user'`
- 映射：Python 层使用 `UserRole` 枚举
- 自动转换：SQLAlchemy 处理 String ↔ Enum 转换

**SystemExpert 表**：
- 主键：`id` (INT, 自增)
- 唯一键：`expert_key` (VARCHAR)
- 添加到 PostgreSQL 并创建

### 🎯 性能优化

- 移除了 SQLite fallback 机制（简化代码）
- 删除了 12 个不需要的文件（migrations + scripts）
- `database.py` 代码减少 70%（118 行 → 36 行）
- 清理了 `data/` 目录（SQLite 数据目录）

### 📝 文档更新

- 更新了 `.gitignore`（移除 SQLite 规则）
- 保留了通用的 Python/VirtualEnv 规则

### ✨ 功能增强（2026-01-28）

**专家列表搜索**：
- 在 ExpertAdminPage 添加搜索框
- 支持按专家名称和 expert_key 过滤
- 显示"未找到匹配的专家"提示
- 优化列表滚动体验（最大高度 + 滚动）

**滚动区域优化**：
- 修复全局滚动条问题（h-screen 限制高度）
- 两个 Card（专家列表 + 配置编辑器）独立滚动
- 右侧配置编辑器内容溢出时滚动，确保保存按钮始终可见
- 专家列表区域自动填充剩余空间滚动
- 系统提示词固定高度 300px，减少溢出风险
- 添加 flex 布局确保各区域正确分配空间
- 移除冗余的专家标识区域（左侧列表已显示 expert_key）
- 减少右侧配置编辑器的垂直空间占用

**统一模型配置管理**：
- ExpertAdminPage 使用 `@/config/models` 的统一模型配置
- CreateAgentPage 使用统一的模型配置
- 删除硬编码的 MODEL_OPTIONS
- 支持的模型包括：
  - DeepSeek: deepseek-chat, deepseek-reasoner
  - OpenAI: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
  - Anthropic: claude-sonnet-4, claude-haiku-3
  - Google: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
- 模型下拉菜单显示友好名称而非 ID

### 🐛 管理员页面修复（2026-01-28）

**ExpertAdminPage 样式问题**：
- 修复专家管理页面内容紧贴屏幕边缘的问题
- 添加 `p-6` padding 到根容器
- 优化布局间距，提升视觉效果

**系统专家数据初始化**：
- 创建 `scripts/init_experts.py` 初始化脚本
- 默认配置 7 个专家（search, coder, researcher, analyzer, writer, planner, image_analyzer）
- 每个专家包含完整的 system_prompt、model 和 temperature 配置
- 启动时自动检查并初始化专家数据（main.py lifespan）
- 支持更新现有专家配置（保留 updated_at）

**后端启动优化**：
- 在 `main.py` 的 lifespan 中集成专家初始化
- 首次启动自动创建 SystemExpert 表数据
- 后续启动仅验证数据完整性

---

## [2026-01-27] - v0.6.0 - RBAC 专家管理系统 + 三大扩展功能

### ✨ 新功能

**RBAC 专家管理系统（Phase 1-3）**：
- 后端：
  - 新增 `UserRole` 枚举（USER, ADMIN, VIEW_ADMIN, EDIT_ADMIN）
  - `User` 表新增 `role` 字段
  - 创建 `SystemExpert` 模型（存储专家 Prompt 和配置）
  - Migration 003：数据库模型升级
  - Migration 004：添加细粒度管理员角色
  - 新增 Admin API 端点：
    - `GET /api/admin/experts` - 获取专家列表
    - `PATCH /api/admin/experts/{expert_key}` - 更新配置
    - `POST /api/admin/experts/preview` - 预览专家响应
    - `POST /api/admin/promote-user` - 升级用户为管理员
  - LangGraph 动态集成：
    - 从数据库加载专家 Prompt（不再硬编码）
    - 缓存机制（避免频繁查询）
    - 支持不同模型和温度参数
    - 降级策略（数据库无数据时使用硬编码）
    - 自动刷新缓存（保存后立即生效）
- 前端：
  - `UserProfile` 类型增加 `role` 字段
  - `AuthTokenResponse` 增加 `role` 字段
  - 创建 `services/admin.ts`：Admin API 服务
  - 更新 `SidebarMenu.tsx`：管理员入口（仅 `role === 'admin'` 可见）
  - 更新 `userStore.ts`：登录后保存角色
  - 创建 `AdminRoute.tsx`：路由鉴权组件（支持细粒度权限）
  - 创建 `ExpertAdminPage.tsx`：专家管理页面
    - 左侧专家列表（点击切换）
    - 右侧配置编辑器（Prompt、Model、Temperature）
    - 预览模式（实时预览专家响应）
    - 保存按钮（带加载状态和验证）
    - Toast 反馈（保存成功/失败）
  - 注册 `/admin/experts` 路由（使用 `AdminRoute` 包装）

**扩展功能 1 - 自动缓存刷新**：
- 后端：
  - `expert_loader.py`：添加 `force_refresh_all()` 函数
  - `admin.py`：`update_expert()` 保存后自动调用 `refresh_cache()`
- 效果：
  - 管理员修改 Prompt 后自动刷新 LangGraph 缓存
  - 下次任务立即生效，无需重启后端
  - 日志输出：`[Admin] LangGraph cache refreshed successfully`

**扩展功能 2 - 实时预览**：
- 后端：
  - `admin.py`：新增 `POST /api/admin/experts/preview` 端点
  - 使用当前数据库配置的 Prompt（不使用缓存）
  - 调用 LLM 模拟专家响应
  - 返回预览结果和执行时间
- 前端：
  - `ExpertAdminPage.tsx`：添加预览模式
  - 测试输入 Textarea（最小 10 字符验证）
  - "开始预览" 按钮（带加载状态）
  - 预览结果展示：
    - 使用模型和温度参数
    - 执行时间（毫秒）
    - 专家响应内容
- 效果：
  - 管理员可以在保存前预览专家响应
  - 实时看到 Prompt 调整后的效果
  - 显示执行时间（性能评估）

**扩展功能 3 - 细粒度权限**：
- 后端：
  - `models.py`：新增 `VIEW_ADMIN`、`EDIT_ADMIN` 角色
  - `admin.py`：新增 `get_current_view_admin()` 权限依赖
  - `get_all_experts()` 改用 `get_current_view_admin`（降低权限要求）
  - Migration 004：添加细粒度角色到 PostgreSQL
- 前端：
  - `AdminRoute.tsx`：新增 `requiredRole` 参数（'admin' | 'edit_admin' | 'view_admin'）
  - 实现 `hasPermission()` 函数（三级权限检查）
- 权限体系：
  - `USER`: 普通用户（无管理权限）
  - `VIEW_ADMIN`: 只查看专家配置（可预览）
  - `EDIT_ADMIN`: 可修改专家配置（可保存）
  - `ADMIN`: 完全管理员（可升级用户）
- 效果：
  - 支持三级权限控制（admin > edit_admin > view_admin）
  - 路由级鉴权（自动重定向）
  - API 端点权限检查（403 错误）

### 🔧 技术改进

**数据库迁移**：
- Migration 003：RBAC 和 SystemExpert 表
- Migration 004：细粒度管理员角色（VIEW_ADMIN, EDIT_ADMIN）
- 支持平滑迁移和回滚

**LangGraph 集成**：
- 动态专家节点：使用 `DYNAMIC_EXPERT_FUNCTIONS`
- 参数化配置：每个专家可独立配置 Model 和 Temperature
- 缓存机制：内存缓存专家配置（避免频繁查询）
- 降级策略：数据库无数据时自动使用硬编码 Prompt

**权限控制**：
- 后端：FastAPI 依赖注入（`get_current_admin`、`get_current_view_admin`）
- 前端：React Router 路由鉴权（`AdminRoute` 组件）
- 数据库：PostgreSQL ENUM 类型（用户角色）

### 📊 性能优化

**缓存机制**：
- 内存缓存专家配置（避免每个 Token 都查询数据库）
- 自动刷新缓存（管理员修改后立即生效）
- 降级策略（数据库无数据时使用硬编码）

**API 优化**：
- 预览端点不使用缓存（确保测试最新配置）
- 细粒度权限（降低查看权限要求）

### 🎨 UI 改进

**专家管理页面**：
- 左侧专家列表（点击切换）
- 右侧配置编辑器：
  - 专家标识（只读）
  - 模型选择下拉框
  - 温度参数滑块（0.0-2.0）
  - 系统提示词文本框（自动高度，最小 400px）
  - 字符计数提示
  - 保存按钮（带加载状态）
  - 表单验证（Prompt 长度 >= 10）
- 预览模式：
  - 测试输入 Textarea（最小 10 字符）
  - "开始预览" 按钮
  - 预览结果展示（模型、温度、执行时间、响应内容）
- Toast 反馈（保存成功/失败、预览成功/失败）

**侧边栏**：
- 管理员入口（仅 `role === 'admin'` 可见）
- Shield 图标标识
- 路由高亮（`/admin/experts`）

### 🐛 Bug 修复

**角色字段缺失**：
- 修复了后端 `TokenResponse` 缺少 `role` 字段的问题
- 修复了前端 `UserProfile` 类型缺少 `role` 字段的问题
- 确保登录后角色正确保存和传递

### 📝 文档更新

**部署文档**：
- 更新了部署步骤（应用迁移、升级账号、重启容器）
- 添加了权限说明和故障排查指南

**系统架构图**：
- 完整的数据流图（前端 ↔ 后端 ↔ 数据库 ↔ LangGraph）
- 权限体系图（三级权限控制）

---

## [2026-01-27] - v0.5.5 - 侧边栏头像卡片状态同步修复

### 🐛 Bug 修复

**侧边栏头像卡片展开/收拢状态同步问题**：
- **问题**：点击侧边栏底部的头像展开卡片，点击其他区域收拢卡片，再次点击头像需要两次点击才能展开卡片
- **原因**：`SidebarUserSection` 组件内部维护了自己的 `isMenuOpen` 状态，而父组件 `Sidebar` 也维护了相同的状态 `isSettingsMenuOpen`，当用户点击外部关闭菜单时，只有父组件状态更新，子组件内部状态未同步
- **修复**：
  - 状态提升：将菜单打开状态统一提升到父组件 `Sidebar` 管理
  - 受控组件改造：修改 `SidebarUserSection` 为受控组件，接收 `isMenuOpen` prop
  - 状态同步：通过 props 将父组件的 `isSettingsMenuOpen` 状态传递给子组件
- **影响**：
  - 点击头像展开卡片，点击其他区域收拢卡片，再次点击头像能立即展开卡片
  - 状态管理统一，避免内部状态与外部状态不一致问题
  - 修复了需要二次点击才能打开菜单的用户体验问题

---

## [2026-01-26] - v0.5.4 - History页面触摸事件修复

### 🐛 Bug 修复

**History页面触摸事件冲突**：
- 修复了History页面中"Cannot read properties of null (reading 'getBoundingClientRect')"错误
- 问题原因：ScrollArea组件被用于处理触摸事件，导致Radix UI内部DOM访问失败
- 修复方案：将触摸事件处理从ScrollArea移到外层div容器
- 确保移动端右滑返回功能正常工作，不影响ScrollArea的滚动功能

---

## [2026-01-26] - v0.5.3 - 复杂模式Loading优化与UI改进

### 🎨 UI改进

**复杂模式Loading状态优化**：
- 优化了复杂模式下AI等待状态的显示，从三个点跳跃改为详细任务进度
- 显示正在执行的专家名称和具体任务描述（如"正在拆解任务"、"正在编写代码"等）
- 增强了用户对AI执行过程的感知，提升用户体验

**模式切换按钮样式优化**：
- 修复了模式切换按钮没有和背景胶囊贴合的问题
- 修复了按钮大小不协调的问题，改用flex布局确保均匀分布
- 将容器和按钮等比例缩小30%，使其更加紧凑精致
- 移除了固定尺寸和单独圆角，使用响应式设计

### 🐛 Bug 修复

**复杂模式消息内容优化**：
- 修复了复杂模式下保存的消息包含技术内容（json、code等）的问题
- 改为保存用户友好的总结文案："✅ 复杂任务执行完成，请查看右侧的专家状态栏和artifact区域获取详细结果。"
- 技术内容（json、代码等）在右侧artifact区域正确显示
- 刷新页面后仍显示友好的总结，不会看到技术内容

**Loading状态逻辑修复**：
- 修复了复杂模式下仍然显示简单模式三个点loading的问题
- 统一了loading显示逻辑，根据conversationMode和runningExpert状态显示不同内容
- 增强了复杂模式初始阶段的loading提示："正在分析需求并规划任务..."

### 🔧 技术改进

**技术内容检测**：
- 增强了技术内容检测逻辑，识别JSON、代码块等技术输出
- 在复杂模式下自动将技术内容替换为友好文案
- 保持了artifact区域的完整技术内容展示

**调试日志增强**：
- 在CanvasChatPage中添加了详细的调试日志
- 帮助诊断消息加载、刷新恢复等问题
- 增强了问题排查能力

### 📊 性能优化

**响应式设计**：
- 模式切换按钮使用flex布局，自动适应容器大小
- 图标尺寸使用响应式设计，在不同屏幕尺寸下都能良好显示
- 优化了UI组件的尺寸比例，提升视觉协调性

---

## [2026-01-26] - v0.5.2 - 消息状态同步与页面卡死修复

### 🐛 Bug 修复

**语法错误修复**：
- 修复了 `FloatingChatPanel.tsx` 中的严重语法错误（函数定义和导出语句位置混乱）
- 修复了 `ArtifactPreviewCard.tsx` 中的重复导出错误（`getArtifactName` 和 `getPreviewContent`）
- 修复了 `MessageItem.tsx` 中的语法错误（JSX和导出语句混乱）

**消息状态同步修复**：
- 修复了从首页发送消息后AI回复不显示在FloatingChatPanel中的问题
- 修复了刷新页面后artifact消失的问题
- 优化了路由跳转时的状态传递，确保消息正确同步

**页面卡死修复**：
- 修复了History页面在移动端右滑时触发页面卡死的问题
- 问题原因：ScrollArea组件与React Router的back事件冲突
- 修复方案：将back事件处理从ScrollArea移到外层div容器

---

## [2026-01-26] - v0.5.1 - 消息持久化与状态恢复

### ✨ 新功能

**消息持久化**：
- 实现了消息的本地存储（localStorage）
- 刷新页面后自动恢复消息历史
- 支持跨会话的消息持久化

**状态恢复**：
- 刷新页面后自动恢复之前的对话状态
- 优化了初始加载逻辑，避免重复加载

### 🔧 技术改进

**状态管理**：
- 优化了chatStore的状态管理逻辑
- 增强了状态持久化和恢复机制

---

## [2026-01-26] - v0.5.0 - 复杂模式与Artifact系统

### ✨ 新功能

**复杂模式（LangGraph多专家协作）**：
- 实现了基于LangGraph的超智能体指挥官工作流
- 支持多专家协作（搜索、编程、研究、分析、写作、规划）
- 实时任务进度展示
- 专家状态栏（显示当前执行的专家）
- Artifact区域（展示代码、搜索结果等技术输出）

**模式切换**：
- 首页添加了模式切换按钮（简单模式/复杂模式）
- 用户可以自由选择使用哪种模式与AI交互
- 简单模式：直接对话，快速响应
- 复杂模式：任务拆解，专家协作，深度分析

**Artifact系统**：
- 实现了Artifact展示和预览系统
- 支持代码高亮、搜索结果预览
- 可下载、复制Artifact内容
- 自动检测技术输出并生成Artifact

### 🔧 技术改进

**LangGraph集成**：
- 指挥官节点：任务拆解和专家路由
- 专家节点：原子化专家执行（直接处理State）
- 聚合器节点：整合所有专家结果
- 流式事件：实时推送任务进度和专家状态

### 📊 性能优化

**实时通信**：
- 使用Server-Sent Events（SSE）实时推送专家执行进度
- 优化了事件处理逻辑，减少延迟

---

## [2026-01-25] - v0.4.0 - AI对话与消息系统

### ✨ 新功能

**AI对话**：
- 实现了完整的AI对话功能
- 支持流式响应（实时显示AI输出）
- 消息历史管理
- 自动滚动到最新消息

**消息系统**：
- 用户消息和AI消息的区分展示
- 消息时间戳
- 消息加载状态
- 消息错误处理

### 🔧 技术改进

**流式响应**：
- 实现了流式LLM调用
- 优化了消息显示性能
- 支持Markdown渲染

---

## [2026-01-24] - v0.3.0 - 用户认证与权限系统

### ✨ 新功能

**用户认证**：
- 手机验证码登录/注册
- JWT Token认证
- 自动Token刷新
- 用户状态持久化

**权限系统**：
- 基于角色的访问控制（RBAC）
- 前端路由鉴权
- 后端API权限检查

### 🔧 技术改进

**认证流程**：
- 统一的认证流程
- Token过期自动刷新
- 安全的Token存储

---

## [2026-01-23] - v0.2.0 - 基础UI框架

### ✨ 新功能

**UI组件**：
- 侧边栏导航
- 主聊天区域
- 消息输入框
- 设置对话框

**响应式设计**：
- 移动端适配
- 平板端适配
- 桌面端适配

### 🔧 技术改进

**前端框架**：
- React 18
- Tailwind CSS
- Radix UI组件库
- Zustand状态管理

---

## [2026-01-22] - v0.1.0 - 项目初始化

### ✨ 新功能

**项目初始化**：
- 前后端分离架构
- Docker容器化部署
- PostgreSQL数据库
- 基础配置文件

### 🔧 技术改进

**技术栈**：
- 后端：FastAPI + Python
- 前端：React + TypeScript + Vite
- 数据库：PostgreSQL
- 容器化：Docker Compose
