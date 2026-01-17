# CHANGELOG

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - 2026-01-17 (全局视觉对齐与移动端体验优化)

### 🎨 全局视觉对齐 (6大设计规范)
- **侧边栏标准化**：
  - 宽度固定为 92px，符合现代 UI 规范
  - 顶部间距 pt-10，图标间距 gap-8，底部头像间距 pb-10
  - 选中态图标添加 w-14 h-14 半透明背景块，Hover 触发蓝紫渐变光晕

- **像素 Logo 升级**：
  - 从 5x5 矩阵升级为 7x7 矩阵，增强 Logo 细节
  - 移除未使用的 pixelSize 变量，修复 linter 警告

- **输入框 Focus 效果**：
  - 添加蓝紫渐变流光动画（3s 循环）
  - 背景网格点间距调整为 40px

- **卡片边框裁切优化**：
  - 所有卡片容器添加 overflow-hidden，确保圆角正确裁切
  - 左侧 4px 竖条完美继承圆角

### 🌙 Dark Mode 全面修复
- **消除白线割裂感**：
  - 所有边框添加 Dark 模式变体：`dark:border-slate-700/30`
  - 修复首页、历史记录、知识库页面与侧边栏过渡白线
  - 修复 Header 与内容区过渡白线

### 📜 滚动体验优化
- **首页全页滚动**：
  - 从固定高度布局改为全页滚动
  - 移除容器高度限制，提升移动端可视内容
  - 响应式网格：grid-cols-1 sm:grid-cols-2 lg:grid-cols-4

- **横向滚动条移除**：
  - MainChatLayout 从 w-screen 改为 w-full
  - 全局添加 overflow-x-hidden
  - 解决页面四面拖动问题

- **滚动条细化**：
  - 宽度从 6px 减少到 3px（减半）
  - border-radius 从 3px 减少到 1.5px

### 📱 移动端适配增强
- **底部内容可见性**：
  - 所有页面添加响应式底部间距：`pb-24 md:pb-20`
  - 修复智能体卡片、历史记录、知识库底部被遮挡问题
  - 修复 Chat 页输入框底部被遮挡问题

### 🖥️ Header 定位修复
- **历史记录与知识库页面**：
  - Header 从 sticky 改为 fixed 定位
  - 添加响应式左间距：`lg:pl-[106px]` 避免被侧边栏遮挡
  - 内容区域添加 `pt-14` 和 `pb-24 md:pb-20`

### 🐛 Bug 修复
- 修复首页智能体卡片不显示问题（条件布局实现）
- 修复 PC 端横向滚动条问题
- 修复 Header 标题被侧边栏遮挡问题
- 修复 PixelLogo 组件 linter 警告

---

## [v0.2.2] - 2026-01-17 (UI 统合重构)

### 🎨 全站 UI 统合重构

**品牌区增强**
- PixelLetters 添加 0.8s 周期呼吸动效 (`animate-pulse-glow`)
- Slogan "POUCH" 应用蓝紫渐变文字 (`bg-gradient-to-r from-blue-400 to-violet-500`)
- 像素点尺寸与间隙优化，增强轻盈透明感

**全站背景与网格水印**
- Light 模式底色：`bg-slate-50`（冷瓷灰）
- Dark 模式底色：`bg-[#020617]`（深空蓝）
- 背景网格点间距扩大至 50px，透明度降低

**页面骨架标准化**
- 所有内页标题左对齐，统一使用 `px-6 md:px-12` 左边距
- 内容容器统一使用 `max-w-5xl mx-auto w-full`
- 极窄毛玻璃 Header (`h-14`, `backdrop-blur-xl`)
- Header 垂直居中修复

**搜索框修复**
- 使用 `relative flex items-center` 布局
- 图标 `absolute left-4`，输入框 `pl-11`
- 背景使用微弱毛玻璃感

**智能体卡片重构 (AgentCard)**
- 商务高级感设计：`rounded-2xl`, 软阴影 `shadow-[0_8px_30px_rgb(0,0,0,0.04)]`
- 左侧 4px 渐变竖条 (`from-blue-400 to-violet-500`)，完全覆盖边缘
- Hover 效果：上移 4px，阴影增强，图标的紫色渐变背景
- 选中状态默认第一个智能体

**首页布局优化**
- 4 列网格 (`lg:grid-cols-4`)，移动端 2 列
- 默认选中第一个智能体卡片
- Tab 标签与卡片左边缘对齐
- "我的智能体"空状态卡片与精选卡片样式统一

**侧边栏升级**
- 选中态图标添加紫色发光阴影 `shadow-[0_0_15px_rgba(139,92,246,0.4)]`

**输入框重构 (GlowingInput)**
- 圆角改为 `rounded-[28px]`
- Dark 模式使用 `bg-slate-950` + 内阴影

**创建智能体页面 (CreateAgentPage)**
- 沉浸式画布风格，透明背景透出像素网格
- 双栏布局：左侧表单，右侧 Sticky 实时预览
- 表单输入框：Light 模式 `bg-white`，Dark 模式 `bg-slate-800/50`
- Focus 状态蓝紫渐变边框 `ring-2 ring-violet-500/50`
- 分类选择：胶囊式标签按钮，选中态紫色渐变
- 系统提示词：2000 字限制
- 像素风格进度条：16 个像素块组成的进度指示器
- 顶部毛玻璃 Header，创建按钮品牌渐变 + Glow 效果

**历史记录与知识库页面**
- Header 垂直居中修复
- 新建按钮改为胶囊形状 (`rounded-full`)

**滚动条统一样式**
- 使用 `scrollbar-thin` 自定义细滚动条
- 停止滚动 2s 后自动隐藏

**其他细节修复**
- HomePage 添加 `cn` 导入
- AgentCard 图标背景渐变优化
- 修复多个 TypeScript 类型问题
- 清理未使用的导入

---

## [Unreleased] - 2026-01-17 (交互优化 + 移动端体验)

### 🎨 UI/UX 优化
- **聊天面板收起/展开功能**：
  - 新增 `isChatMinimized` 状态管理聊天面板折叠状态
  - 右上角收起按钮：点击触发面板滑出动画
  - 右下角机器人恢复按钮：紫色渐变背景 (`from-violet-500 to-blue-600`)
  - 平滑过渡动画：`transition-all duration-300 ease-in-out`
  - 使用 `pointer-events-none` 确保收起后画布可点击
  - 机器人按钮带 `animate-bounce` 呼吸效果提示交互
  - z-[100] 确保恢复按钮在所有元素之上

- **侧边栏深度优化**：
  - 宽度调整为 92px，符合现代 UI 规范
  - Dark 模式渐变：`bg-gradient-to-b from-[#1e293b] to-[#0f172a]`（深蓝宝石到深渊黑）
  - Light 模式渐变：`bg-gradient-to-b from-slate-700 to-slate-900` + `backdrop-blur-xl`
  - 右侧边框：`border-r border-slate-200/50`（Light 模式）/ `border-r border-slate-700/30`（Dark 模式）
  - 实现视觉层次感和流动性设计

- **头像容器修复**：
  - 彻底移除点击时的蓝色外框
  - 添加 `outline-none focus:outline-none ring-0 focus:ring-0 select-none`
  - 容器样式：`mx-3 mb-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md`
  - 头像渐变：`bg-gradient-to-br from-violet-500 to-blue-600`

- **侧边栏按钮状态优化**：
  - Light 模式 Active：`bg-white text-indigo-600 shadow-sm`（浅底紫字）
  - Light 模式 Inactive：`text-slate-400 hover:bg-gray-100/50 hover:text-gray-700`
  - Dark 模式 Active：`bg-gray-700 text-white`
  - Dark 模式 Inactive：`text-slate-400 hover:bg-gray-700/50`

### 📱 移动端体验增强
- **右滑返回功能**：
  - 触发区域：屏幕左侧 30px 边缘
  - 滑动阈值：100px 触发返回首页
  - 最大滑动距离：150px 限制
  - 视觉反馈：紫色渐变指示器 (`from-indigo-500/30`) + 左箭头图标
  - 仅在聊天模式下响应，避免误触
  - 实时显示滑动进度（1-150px）
  - 使用 `backdrop-blur-sm` 增强视觉效果

- **画布与对话模式切换**：
  - 预览模式下添加悬浮"对话"按钮
  - 位置：`fixed top-4 left-1/2 -translate-x-1/2 z-50`
  - 样式：`w-28 h-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md`
  - 紫色圆点指示器 + "对话"文字

### 🔧 技术实现
- **状态管理优化**：
  - `isChatMinimized` 状态提升到 `CanvasChatPage` 组件
  - 通过 props 传递给 `XPouchLayout` 和 `FloatingChatPanel`
  - 使用双状态源策略（父组件优先，本地状态兜底）
  - 避免组件间状态同步问题

- **触摸事件处理**：
  - `handleTouchStart`：检测左侧边缘触摸起始点
  - `handleTouchMove`：计算滑动距离并更新 UI
  - `handleTouchEnd`：判断是否超过阈值并触发返回
  - 使用 `useRef` 存储触摸状态，避免重复渲染

- **动画系统**：
  - 使用 Framer Motion 的 `AnimatePresence` 和 `motion.div`
  - 面板滑出：`translate-x-[110%] opacity-0`
  - 平滑过渡：0.3s ease-in-out
  - 机器人按钮动画：`animate-bounce` 持续提示

### 🐛 Bug 修复
- **头像点击框问题**：彻底移除所有 ring 和 outline 效果
- **Light 模式侧边栏可见性**：修复 Active 状态全白不可见问题
- **右滑手势冲突**：仅在左侧边缘响应，避免误触发
- **对话框层级**：修复恢复按钮被遮挡的问题

---

## [Unreleased] - 2026-01-17 (UI 优化 + 超智能体规划)

### 🎨 UI/UX 升级：Glassmorphism 设计系统
- **Dark Mode 优化**：
  - 侧边栏背景升级为 `#0f172a/80`（深蓝黑）+ 毛玻璃效果
  - 用户单元格背景使用 `#1e293b`（稍浅的深蓝）
  - 全局应用 backdrop-blur-md、ring 效果提升深度感
- **Agent 卡片重新设计**：
  - 软阴影：`shadow-[0_8px_30px_rgb(0,0,0,0.04)]`
  - 毛玻璃背景：`backdrop-blur-sm bg-white/40`
  - 选中状态：紫色边框 + 外发光效果
  - Badge 风格标签：`text-[10px] px-2 py-0.5 rounded-full font-bold`
  - Hover 动效：向上平移 1px + 阴影加深
- **侧边栏优化**：
  - 头像区域移除上方分隔线
  - Light/Dark 模式背景色正确适配
  - 头像容器缩小至 36px×36px
  - 添加 ring 紫色光环效果（hover 时增强）
  - 弹出菜单移入头像点击区域，位于"模型配置"上方

### ✨ 沉浸式体验：动态粒子网格
- **ParticleGrid 组件**（Dark Mode 专属）：
  - 40px 间距的稀疏粒子网格，模仿点阵风格
  - 极低透明度（5%-15%），营造微弱背景氛围
  - 处理消息时触发向中心汇聚动画
    - 靠近中心的粒子缩小（scale: 0.4-1）
    - 靠近中心的粒子增亮（opacity: 0.35-0.75）
    - 15% 的位移量向中心移动，持续 2s
  - 中心光晕效果：200px 径向渐变，增强"AI 调动资源"的心理暗示

### 🔧 组件修复
- **Sidebar.tsx**：
  - 修复 Light 模式下侧边栏和头像区域背景色不可见的问题
  - 添加 `bg-white/80` 和 `bg-gray-100/50` 的浅色样式
- **main.tsx**：
  - 修复 HistoryPageWrapper 的循环引用错误
- **ParticleGrid.tsx**：
  - 修复 JSX 结构错误，移除多余的 `</AnimatePresence>` 标签

### 🌍 国际化扩展
- 新增翻译键：`addCustomAgent`、`createYourFirstAgent`
- 支持中文、英文、日语三种语言

---

## [Unreleased] - 2026-01-17 (产品路线图更新)

### 📋 战略方向：超智能体探索
随着核心功能（双层交互画布、基础智能体、数据持久化）的完善，XPouch AI 即将进入下一阶段的探索——**超智能体系统**。

**下一阶段规划 (v0.3.x)**
- 🔮 **多智能体协作**：设计智能体之间的动态任务分工与协作机制
  - 智能体注册与发现系统
  - 任务分发与结果聚合
  - 协作冲突解决策略

- 🔮 **自主决策系统**：基于上下文的智能任务拆解与执行规划
  - 目标分解引擎
  - 执行路径优化
  - 动态调整机制

- 🔮 **知识增强引擎**：知识库检索与实时学习能力
  - 向量检索集成（RAG）
  - 知识图谱构建
  - 增量学习机制

- 🔮 **推理与反思**：自我纠错、多步推理、思维链机制
  - 思维链（CoT）推理
  - 自我反思与优化
  - 多步推理验证

- 🔮 **工具调用框架**：可插拔的工具生态系统
  - Web 搜索工具
  - 代码执行环境
  - 数据分析工具
  - 第三方 API 集成

---

## [Unreleased]

**Interactive Canvas (底层画布)**
- 新增 `InteractiveCanvas.tsx` 组件，实现全屏可交互画布
- 使用 Framer Motion 实现平滑缩放和平移动画
- 缩放范围：25% - 300%
- 滚轮缩放 + 底部控制栏（缩小/放大/重置）
- 径向渐变 + 网格背景，支持深色模式
- 固定定位 (`fixed inset-0`)，不遮挡布局

**Floating Chat Panel (顶层悬浮对话框)**
- 新增 `FloatingChatPanel.tsx` 组件
- 毛玻璃效果：`bg-white/90 backdrop-blur-xl`
- 大圆角设计：`rounded-2xl`
- 高深度阴影：`shadow-2xl`
- **可收起头部**：点击展开/折叠面板
- **可拖动**：按住头部自由定位
- **点击穿透**：画布拖动事件不被拦截
- Shadcn ScrollArea 消息列表
- 底部固定 Textarea 输入框

**Artifact Renderer (动态内容渲染)**
- 新增 `ArtifactRenderer.tsx` 组件
- 支持三种 Artifact 类型：
  - **code**：代码预览 + 语法高亮 + 复制按钮
  - **mermaid**：动态渲染流程图
  - **markdown**：安全渲染 Markdown 内容

### 🪝 新增 Hooks

- **useArtifactListener.ts**：SSE 监听 Hook
  - 监听 `artifact_update` 事件
  - 自动重连机制
  - 更新 Canvas Store 中的 artifact 状态

### 📦 新增依赖

- `framer-motion@^11.15.0`：动画库
- `mermaid@^11.4.0`：流程图渲染

### 🐛 Bug 修复

- **双重气泡问题**：修复 `useChat.ts` 中消息同步问题
  - 使用 `useChatStore.getState().messages` 获取最新状态
  - `updateMessage` 支持追加模式 (`append: true`)
  - 避免 React 闭包中的 stale state 问题
- **输入框重复发送按钮**：移除 GlowingInput 外部多余的发送按钮
- **滚动条问题**：移除 `scrollbar-gutter`，添加 `overflow:hidden`
- **画布布局问题**：改用 `fixed inset-0` 定位修复白色竖条

### 🔧 状态管理增强

**canvasStore.ts 新增状态**：
- `scale`：缩放比例
- `offsetX` / `offsetY`：平移偏移量
- `isDragging`：拖动状态
- `artifactType` / `artifactContent`：Artifact 状态管理
- `setScale` / `setOffset` / `setArtifact` 等方法

---

## [v0.2.1] - 2026-01-16 (Docker & 体验优化)

### 🐳 部署与运维
- **Docker 化**：提供了完整的 `Dockerfile` 和 `docker-compose.yml`，支持一键启动前后端。
- **环境自适应**：前端智能判断开发环境（直连后端）与生产环境（Nginx 代理），无需手动修改代码即可部署。
- **Nginx 集成**：前端容器内置 Nginx，处理静态资源服务与 API 反向代理。

### 🎨 UI/UX 优化
- **首页布局**：紧凑化设计，拉近了 Logo 与输入框的距离，提升视觉凝聚力。
- **视觉增强**：
    - 聊天输入框在非激活状态下边框加深，边界更清晰。
    - 聊天顶部栏高度收窄，并增加了精致的毛玻璃 (Backdrop Blur) 吸顶效果。
    - 首页"我的智能体"切换时增加滚动条预留空间，彻底解决了页面抖动问题。
- **交互细节**：
    - 侧边栏头像菜单加宽，改为长方形布局，更符合桌面端操作习惯。
    - 修复了从首页跳转到对话页时，首条消息可能不显示的 Race Condition 问题。

### 🐛 核心修复
- **后端异步调用**：修复了 FastAPI 与 LangGraph 结合时，因同步调用异步节点导致的 `500 Internal Server Error`。
- **CORS 策略**：完善了跨域资源共享配置，确保本地开发与容器通信畅通。
- **数据关联**：修复了获取会话详情时，后端未加载关联消息 (Lazy Loading) 导致历史记录空白的问题。

---

## [v0.2.0] - 2026-01-16 (架构升级版)

本次更新是一次重大的架构升级，全面提升了系统的稳定性、可维护性和数据安全性。

### 🚀 架构升级 (Backend)
- **技术栈迁移**：从 Node.js (Express) 迁移至 **Python (FastAPI)**，充分利用 Python 在 AI 领域的生态优势。
- **LangGraph Python**：重写了智能体工作流 (`graph.py`)，逻辑与原 TS 版保持一致，但更易于扩展。
- **数据持久化**：
    - 引入 **SQLModel (SQLite)** 作为数据库。
    - 实现了 `Conversation` 和 `Message` 的持久化存储。
    - 告别了不可靠的 LocalStorage 存储方案，数据云端（数据库）同步。
- **API 增强**：
    - 新增 RESTful 接口：`GET /conversations` (列表), `GET /conversations/{id}` (详情), `DELETE` (删除)。
    - 实现了更健壮的 **SSE (Server-Sent Events)** 流式输出。

### ⚡️ 前端重构 (Frontend)
- **状态管理**：引入 **Zustand** (`chatStore.ts`) 替代 React Context/State，解决了 Prop Drilling 问题。
- **路由系统**：引入 **React Router** (`react-router-dom`)。
    - 支持通过 URL (`/chat/:id`) 直接访问特定会话。
    - 实现了 `HomePage`, `ChatPage`, `HistoryPage` 的组件解耦。
- **逻辑抽离**：创建自定义 Hook `useChat.ts`，将复杂的发送/接收/流处理逻辑从 UI 组件中剥离。
- **体验优化**：
    - 自动保存会话：发送第一条消息时自动创建会话并更新 URL。
    - 历史记录：从后端实时拉取，支持按时间排序和删除。

### 🐛 修复
- 修复了刷新页面导致聊天记录丢失的问题（得益于数据库集成）。
- 修复了 URL 状态与当前会话不一致的问题。
- 修复了大量 TypeScript 类型定义错误 (`any` 类型减少)。
- 移除了未使用的代码和依赖，减小了包体积。

---

## [v0.1.1] - 2026-01-15 (晚间)

### 新增功能
- **自定义智能体**：实现了用户创建、保存自定义 AI 智能体的完整流程
- **智能体管理**：首页新增 Tab 切换（"精选智能体" vs "我创建的"）
- **真实流式输出**：后端重构为基于 LangGraph `streamEvents` 的 Token 级 SSE 流式传输
- **侧边栏升级**：
    - 新增"创建用户智能体"按钮
    - "回到上一个会话"按钮逻辑优化，准确恢复最近会话
- **流畅动画**：全局过渡动画统一调整为 200ms，优化主题切换体验

### 优化
- **对话体验**：
    - 修复了对话开始时出现"空气泡"和"双重气泡"的视觉问题
    - 移除了 AI 回复中意外出现的内部意图分类前缀（如 `general_chat`）
- **上下文管理**：修复了多轮对话中上下文传递和消息去重的问题
- **导航状态**：优化了侧边栏在不同页面（首页/对话/历史）下的高亮逻辑

### 修复
- 修复了流式输出时 JSON 解析可能导致的乱码问题
- 修复了从历史记录进入会话时侧边栏状态不正确的问题

---

## [v0.1.0] - 2026-01-15 (下午)

### 新增功能
- 实现流式输出效果（SSE 格式）
- 连续对话支持：发送消息后输入框保持 focus 状态
- 历史记录页面：按助手分组的卡片式展示
- 新增"当前对话"按钮，快速回到最近会话
- 四个功能按钮独立切换：首页/当前对话/历史记录/知识库
- 主题切换按钮颜色过渡动画

### 优化
- 侧边栏宽度从 100px 调整为 92px
- 头像大小调整为 40x40px 与功能按钮一致
- 移动端适配优化
- 历史记录重复问题修复
- 点击历史记录进入对话时自动选中"当前对话"按钮

### 修复
- 修复重复保存对话记录的问题
- 修复移动端头像不可见问题
- 修复弹出菜单被遮挡问题
- 修复主题切换闪烁问题

---

## [v0.0.5] - 2026-01-15 (上午)

### 新增功能
- 多智能体系统（8个 AI 助手）
- 响应式设计（移动端/平板/桌面）
- 深色模式支持
- 国际化（中/英/日）
- 流式打字效果

### 优化
- 前端/后端分离的 monorepo 架构
- 代码分割和性能优化
- 错误边界处理

---

## [v0.0.1] - 初始版本

### 新增功能
- 基础聊天功能
- LangGraph 工作流引擎
- 多模型支持（DeepSeek/OpenAI/Anthropic/Google）
