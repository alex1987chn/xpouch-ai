# CHANGELOG

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### 🎨 Artifact 颜色统一修复

**SearchArtifact.tsx - 主题配色调整**
- Header 渐变: `from-blue-500 to-cyan-600` → `from-blue-500 to-violet-500`
- 验证图标: `text-emerald-500` (绿色) → `text-blue-500 dark:text-blue-400` (蓝色)
- 原因: 使用了青色和绿色，不符合项目蓝紫色系设计规范
- 影响: 所有 artifact 现在都使用统一的蓝紫色系

**HtmlArtifact.tsx - 浏览器控制点颜色调整**
- 原设计: 红色、黄色、绿色 (标准浏览器颜色)
- 新设计: 灰色系 + 蓝色强调点
- 颜色映射:
  - 红色 → `bg-slate-600 hover:bg-slate-500`
  - 黄色 → `bg-slate-600 hover:bg-slate-500`
  - 绿色 → `bg-blue-500 hover:bg-blue-400` (项目强调色)
- 原因: 标准浏览器三色不符合项目整体视觉风格
- 影响: 浏览器风格预览现在与项目主题一致

### 🎨 UI/UX 优化

**删除确认对话框**
- 新增 `components/ui/dialog.tsx`：基于 Radix UI 的通用对话框组件
- 新增 `components/DeleteConfirmDialog.tsx`：专门的删除确认对话框
- 功能特性：
  - 红色警告图标和提示
  - 显示删除项名称
  - "删除中"加载状态
  - 支持取消/确认操作
  - 异步操作支持
- 更新 `HomePage.tsx`：集成删除确认对话框替代原生 confirm

**智能体卡片点击修复**
- 问题: `AgentCard` 在"我的智能体"标签页下点击无效（onClick 被禁用）
- 原因: `showDeleteButton ? undefined : onClick` 条件判断错误
- 修复: 移除条件判断，确保点击事件始终生效
- 影响: 自定义智能体现在可以正常点击进入对话界面

### 🐛 后端 Bug 修复

**CustomAgent 拼写错误修复**
- 问题: `backend/main.py` 中存在 8 处 `CustomomAgent` → `CustomAgent` 拼写错误
- 影响: Python 编译失败，导致后端无法加载
- 修复: 统一所有引用为正确的 `CustomAgent` 类名
- 影响: 后端可以正常启动并处理请求

**Python 缓存清理**
- 问题: Python `__pycache__` 缓存损坏导致旧的错误代码仍被加载
- 表现: "cannot import name 'EXPERT_DESCRIPTIONS'" 错误持续出现
- 修复: 清理 167 个 `__pycache__` 目录，终止 14 个僵尸 Python 进程
- 影响: 确保运行的是最新代码，缓存问题彻底解决

**API 接口优化**
- 优化: 移除 `/api/agents` 接口中的冗余 `CustomAgent` 导入
- 影响: 代码更简洁，避免重复导入

### 🔧 Bug 修复与优化

**CanvasChatPage.tsx - FileCode 未定义错误**
- 问题: 使用 `FileCode` 组件但未导入，导入时使用了别名 `HtmlIcon`
- 修复: 将第 312 行的 `<FileCode />` 改为 `<HtmlIcon />`
- 影响: 修复了页面渲染时的 `ReferenceError: FileCode is not defined`

**滚动条样式优化**
- 问题: Artifact 内容区域使用系统默认滚动条，与项目设计风格不一致
- 修复: 第 332 行添加 `smooth-scroll` 类，使用自定义细滚动条
- 影响: Artifact 预览区域现在显示 3px 宽度的自定义滚动条，与消息区域样式一致

**main.py - LangSmith 追踪初始化恢复**
- 问题: `git reset` 操作导致 LangSmith 初始化代码丢失
- 修复: 在 `lifespan` 函数中添加 `init_langchain_tracing()` 和 `validate_config()`
- 影响: 恢复了 LangSmith 追踪功能，确保链路可观测性

**依赖管理**
- 添加缺失依赖: `@tailwindcss/typography@^0.5.19` 到 `frontend/package.json`
- 修复问题: 服务器部署时构建失败（Cannot find module '@tailwindcss/typography'）
- 影响: 确保生产环境构建成功

**版本控制优化**
- 移除 `backend/data/database.db` 从 git 跟踪
- 原因: 数据库文件包含本地测试数据，不应提交
- 影响: 避免数据库文件污染版本控制

---

## [v0.2.3] - 2026-01-19

### 📱 移动端聊天体验优化

**Flexbox 滚动架构优化**
- 消息区域使用 `flex-1 overflow-y-auto` 实现独立滚动
- Header 和 Input 区域使用 `flex-shrink-0` 固定定位
- 添加 `min-h-0` 确保 flex 子元素正确收缩以触发滚动

**自动滚动优化**
- 使用 `scrollIntoView({ behavior: 'smooth' })` 替代 scrollTop
- 新消息到达时平滑滚动到底部

**对话面板全屏适配**
- 移动端使用 `fixed inset-0 h-[100dvh]` 全屏定位
- 移除移动端 Header 的返回箭头按钮（使用滑动手势返回）
- Artifact 全屏预览：移动端移除圆角和边框

**Bug 修复**
- 消息区域无滚动条 → 添加 `min-h-0` + `overflow-hidden`
- 输入框溢出 → 限制 textarea max-h
- 移动端切换按钮被遮挡 → 添加 z-[60]
- 圆角产生黑边 → 移动端移除圆角

---

## [v0.2.2] - 2026-01-17

### 🏗️ 超智能体基础设施

**后端数据模型扩展**
- 新增 `SubTask` 模型：支持任务分解和状态追踪
- 新增 `TaskSession` 模型：管理任务会话和子任务关联

**LangGraph 指挥官工作流**
- 实现指挥官节点：分析用户查询，拆解为多个子任务
- 实现专家分发器：循环分发任务到对应专家
- 实现聚合器节点：整合所有专家执行结果
- 支持专家类型：search, coder, researcher, analyzer, writer, planner

**通用 JSON 解析器**
- 新增 `utils/json_parser.py`：兼容所有 LLM 的 JSON 响应解析
- 移除内联 JSON 解析代码，使用统一解析器

---

## [v0.2.1] - 2026-01-16

### 🐛 运行时错误修复

**CreateAgentPage.tsx - 缺少导入**
- 添加 `AgentPreviewCard` 组件导入

**Sidebar.tsx - 个人中心菜单无法打开**
- 添加 `isSettingsMenuOpen` 状态管理

**SidebarSettingsMenu.tsx - 缺少图标导入**
- 添加 `Star`, `Plane`, `Crown` 图标导入

---

## [v0.2.0] - 2026-01-16

### 🎨 UI 统合重构

**品牌区增强**
- PixelLetters 添加 0.8s 周期呼吸动效
- Slogan "POUCH" 应用蓝紫渐变文字

**全站背景与网格水印**
- Light 模式底色：`bg-slate-50`
- Dark 模式底色：`bg-[#020617]`
- 背景网格点间距扩大至 50px

**智能体卡片重构**
- 商务高级感设计：`rounded-2xl`，软阴影
- 左侧 4px 渐变竖条（from-blue-400 to-violet-500）
- Hover 效果：上移 4px，阴影增强

**滚动条统一样式**
- 使用 `scrollbar-thin` 自定义细滚动条
- 停止滚动 2s 后自动隐藏

---

## [v0.1.1] - 2026-01-15

### 🎨 UI/UX 升级：Glassmorphism 设计系统

**Dark Mode 优化**
- 侧边栏背景升级为 `#0f172a/80`（深蓝黑）+ 毛玻璃效果
- 用户单元格背景使用 `#1e293b`

**沉浸式体验：动态粒子网格**
- Dark Mode 专属：40px 间距的稀疏粒子网格
- 处理消息时触发向中心汇聚动画

---

## [v0.1.0] - 2026-01-15

### 🚀 核心功能

- 多智能体系统（8个 AI 助手）
- 响应式设计（移动端/平板/桌面）
- 深色模式支持
- 国际化（中/英/日）
- 流式打字效果

---

## 查看历史版本

旧版本记录已归档至 [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)
