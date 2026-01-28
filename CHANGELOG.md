# CHANGELOG

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
