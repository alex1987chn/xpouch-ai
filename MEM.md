# XPouch AI 项目记忆（Memory）

本文档记录项目的重要变更、决策和里程碑。

---

## 2026-01-24：消息气泡UI优化

### 🎨 UI 优化

**消息气泡间距优化**：
- 移除双重 padding：Card 使用 `p-3` (12px)，CardContent 使用 `p-0`
- 之前：Card `p-4` (16px) + CardContent `p-3` (12px) = 28px
- 现在：Card `p-3` (12px) + CardContent `p-0` = 12px

**文本行高和间距优化**：
- 用户消息添加 `leading-6` (行高1.5)
- Markdown 内容使用 prose 样式配置：
  - `prose-sm`：小号文字
  - `prose-p:my-2`：段落间距0.5rem
  - `prose-p:leading-6`：段落行高1.5
  - `prose-headings:my-3`：标题间距0.75rem
  - `prose-ul:my-2` / `prose-ol:my-2`：列表间距0.5rem
  - `prose-li:my-1`：列表项间距0.25rem
  - `prose-p:first:mt-0` / `prose-p:last:mb-0`：首尾段落去掉多余间距

**Artifact 间距优化**：
- Artifact 卡片之间从 `space-y-3` (12px) 改为 `space-y-2` (8px)
- 更紧凑，更符合主流应用风格

**消息列表间距优化**：
- 消息之间从 `space-y-4` (16px) 改为 `space-y-5` (20px)
- 更接近 ChatGPT/DeepSeek 的间距（约24px）

**系统消息样式优化**：
- 使用 `prose-xs` 配合紧凑的间距配置
- 与普通消息保持一致的视觉风格

### 🔧 按钮布局优化

**布局调整**：
- 创建新的 flex-col 容器包裹 Card 和按钮
- Card 在上方，Action Buttons 在下方
- 根据 `msg.role` 动态调整对齐方式（用户消息靠右，助手消息靠左）

**按钮样式优化**（参考 ChatGPT/DeepSeek）：
- 移除背景色：使用纯文本图标，更简洁
- 减小圆角：从 `rounded-lg` 改为 `rounded-md`
- 优化间距：`mt-1.5` (6px) 与气泡保持合适距离
- 柔和颜色：`text-gray-500` → `hover:text-gray-700`
- 暗色模式支持：`dark:text-gray-400` → `dark:hover:text-gray-200`
- Hover 效果：`hover:bg-gray-100 dark:hover:bg-gray-700`
- 添加提示：`title` 属性提供用户提示

### 🐛 Bug 修复

**JSX 语法错误修复**：
- 问题：FloatingChatPanel.tsx 第 523 行存在相邻 JSX 元素未包裹的问题
- 解决方案：将复杂的嵌套三元表达式条件渲染重构为更清晰的 `if` 语句
- 影响：构建成功，无编译错误

**Message 类型导入修复**：
- 问题：从错误的路径导入 `Message` 类型（`@/store/chatStore`）
- 解决方案：将导入从 `@/store/chatStore` 改为 `@/types`
- 影响：类型安全性提升

### ✅ 验证结果

**构建测试**：
- ✅ Vite 7.3.1 构建成功
- ✅ 无编译错误或警告
- ✅ 所有功能运行正常

**视觉效果**：
- 消息气泡更紧凑，更符合主流应用标准
- 按钮位置更合理，交互体验更佳
- 整体视觉风格更统一、专业

---

## 2026-01-23：前端依赖升级到最新稳定版本

### 🔧 更新内容

**前端核心依赖升级**：
- **Vite**: 从 ^5.4.17 升级到 **^7.3.1**（5.x → 7.x 重大版本更新）
- **Framer Motion**: 从 ^11.15.0 升级到 **^12.29.0**（11.x → 12.x 重大版本更新）
- **Lucide React**: 从 ^0.462.0 升级到 **^0.563.0**（0.46 → 0.56 版本）

**开发者工具更新**：
- **@vitejs/plugin-react**: 从 ^4.3.4 升级到 **^5.1.2**（支持 Vite 7）
- **@sentry/react**: 从 ^10.33.0 升级到 **^10.36.0**
- **@sentry/vite-plugin**: 从 ^4.6.1 升级到 **^4.7.0**
- **@testing-library/react**: 从 ^16.3.1 升级到 **^16.3.2**
- **@types/node**: 从 ^25.0.7 升级到 **^25.0.10**

### 🔧 配置修复

**pnpm workspace 配置**：
- 创建 `pnpm-workspace.yaml` 文件
- 配置仅包含 `frontend` 包（保持 Monorepo 结构）
- 解决 pnpm 的 workspace 警告

**依赖位置清理**：
- 从根目录 `package.json` 移除前端依赖
- 确保前端包独立管理自己的依赖
- 保持项目结构清晰

### ✅ 验证结果

**构建测试**：
- ✅ Vite 7.3.1 构建成功
- ✅ 无编译错误或警告
- ✅ 所有功能运行正常

**关键指标**：
- **构建时间**: 6.19秒
- **包大小**: 主 chunk 1.05 MB（合理范围）
- **兼容性**: Node 22 + React 18 完全支持

### 🚀 升级评估

**React 19 升级可行性**：
- ✅ 代码模式兼容（函数组件 + hooks）
- ⚠️ 需要检查第三方库支持
- 🔶 建议暂不升级（React 18 稳定，收益有限）

**Vite 7 + Tailwind CSS 4**：
- ✅ **Vite 7.3.1 已升级**（构建成功）
- 🟡 Tailwind CSS 4 仍处于 Alpha（不推荐生产使用）

### 📊 项目状态

- **前后端架构**: ✅ 健康（Monorepo 结构正确）
- **依赖版本**: ✅ 最新稳定版
- **构建系统**: ✅ Vite 7 运行正常
- **Workspace 配置**: ✅ 无警告

---

## 项目架构里程碑

### 2026-01-22：XPouch AI 架构重构完成
完成7个阶段的重构项目，实现前后端统一架构，支持三种会话类型（default/custom/ai），Artifacts统一处理，简单和复杂双模式运行稳定。

### 2026-01-21：性能优化与交互改进
- FloatingExpertBar 从 112 个 DOM 元素优化到 7 个
- 移除布局动画和 motion 组件
- 聊天消息悬停显示操作按钮
- Artifact 标题支持自定义

### 2026-01-20：专家协作可视化系统
移除 InteractiveCanvas 中间层，改为 XPouchLayout 三区扁平布局（专家状态栏 + artifact + 对话面板），实现专家执行过程可视化。

---

## 技术决策

### 依赖管理策略
- **前端**: pnpm + workspace 配置
- **后端**: uv（Python 包管理器）
- **数据库**: SQLModel（SQLite + ORM）

### 架构设计
- **前后端分离**: Vite + React 前端，FastAPI + LangGraph 后端
- **双模式对话**: 简单模式（直连 LLM）和复杂模式（专家协作）
- **组件库**: 100% shadcn/ui 覆盖

### 性能优化
- 减少 DOM 节点数量
- 移除昂贵动画计算
- 统一滚动行为
- 清理调试日志

---

*本记忆文档于 2026-01-23 创建，记录项目重要变更。*

---

## 2026-01-23：UI组件优化和侧边栏菜单调整

### UI组件优化

**主题切换按钮简化**：
- 移除 `Sidebar.tsx` 中包裹 `ThemeSwitcher` 的圆形背景容器
- 按钮直接显示，更加简洁
- 移除相关的不必要样式类

**搜索框组件统一**：
- `KnowledgeBasePage.tsx` 的搜索框从原生 `<input>` + 自定义样式替换为 shadcn/ui 的 `Input` 组件
- 样式与 `HistoryPage.tsx` 保持完全一致
- 添加 `Input` 组件导入

**历史会话卡片优化**：
- 移除历史会话卡片右下角的 `ArrowRight` 图标
- 清理未使用的 `ArrowRight` 导入
- 卡片点击即可进入会话，无需额外箭头提示

### 侧边栏菜单调整

**菜单顺序调整**：
- 知识库按钮移动到历史记录按钮上方
- 调整后顺序：首页 → 知识库 → 历史记录
- 同步调整 `isOnKnowledge` 和 `isOnHistory` 变量定义顺序

**路由配置同步**：
- 交换 `main.tsx` 中 `knowledge` 和 `history` 路由配置顺序
- 确保路由定义与侧边栏菜单顺序保持一致

### 文件变更统计

- 修改文件数：7 个
- 代码变更：+76 行，-53 行

---

## 2026-01-24：侧边栏重构与 AgentCard 设计优化

### 侧边栏重构

**窄侧边栏优化**：
- 宽度从 48px 改为 72px
- 窄侧边栏只显示图标，居中布局
- 展开/收拢动画流畅过渡
- PixelLogo（图标）和 PixelLettersStatic（文字）分离使用

**底部区域布局优化**：
- 紧凑行布局：用户信息 + 分隔线 + 主题切换 + 收拢按钮
- 边距统一为 12px
- 主题图标颜色调整为 indigo 系列
- 收拢按钮靠右对齐

**主题配色优化**：
- Light 模式：柔和渐变 `white → gray-50 → gray-100`
- Dark 模式：深蓝灰渐变 `#1e293b → #1a1d2e → #0d0f14`
- 选中状态：indigo-100 背景 + indigo-700 文字
- Hover 效果：白色半透明遮罩

**ScrollArea 优化**：
- 窄侧边栏不滚动
- 展开状态使用 ScrollArea 支持最近会话列表滚动

### AgentCard 设计优化

**参考优秀产品设计**（Linear、Vercel、Notion、Claude）：
- 移除竖条指示器，使用渐变边框代替
- 删除按钮 hover 时淡入显示
- 默认助手使用简洁配色，不抢视觉
- 分类标签 hover 效果优化
- 边距统一为 12px
- 图标容器阴影系统

**配色系统**：
- 根据图标类型选择配色（violet/blue/emerald/amber）
- 背景渐变：柔和渐变 + 半透明遮罩
- 选中状态：渐变边框 + 阴影
- hover 效果：背景加深 + 文字颜色变化

### pnpm workspace 配置修复

**依赖管理优化**：
- 创建 `pnpm-workspace.yaml` 文件
- 前端包独立管理依赖
- 解决 workspace 警告

### 文件变更
- 修改文件数：多个前端组件文件
- 代码优化：更简洁的 UI 组件实现--
