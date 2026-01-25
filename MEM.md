# XPouch AI 项目记忆（Memory）

本文档记录项目的重要变更、决策和里程碑。

---

## 2026-01-26：Artifact 预览重复创建修复

### 🐛 Bug 修复

**简单模式点击代码预览卡片重复创建 artifact 标签页问题修复**：

- **问题**：在简单模式下，AI回复中的代码块会生成预览卡片，但点击同一卡片会重复创建 artifact 会话和标签页，导致"越点越多"。
- **原因**：使用 `expertResults` 数组检查会话存在性，但简单模式下不会在 `expertResults` 中创建 `'simple'` 类型的专家记录，导致每次点击都认为会话不存在。
- **修复**：
  - 改用 `artifactSessions` 状态检查会话存在性（使用 `getArtifactSession('simple')`）
  - 添加重复检测逻辑：当 artifact 已存在时，直接切换到对应标签页而不是创建新的
  - 添加 `switchArtifactIndex` 函数支持标签页索引切换
  - 更新依赖项确保状态一致性
- **影响**：
  - 点击同一代码预览卡片不会再创建重复标签页
  - 点击不同代码块会为每个代码块创建独立标签页（符合预期）
  - 标签页管理统一使用 `artifactSessions`，避免与 `expertResults` 混淆

## 2026-01-25：JWT 认证系统

## 2026-01-25：JWT 认证系统

### ✨ 新增功能

**手机验证码登录系统**：
- **后端实现**：
  - 新增 `backend/auth.py` 认证路由模块
  - `/api/auth/send-code` - 发送验证码（开发环境返回验证码）
  - `/api/auth/verify-code` - 验证并登录/注册
  - `/api/auth/refresh-token` - 刷新访问令牌
  - JWT token 管理（access_token: 30天, refresh_token: 60天）

- **数据库迁移**：
  - `migration_002_jwt_auth.py` - 新增认证相关字段
  - User 表新增 13 个字段（手机号、邮箱、验证码、token等）
  - 创建 4 个唯一索引（phone_number, email, provider_id）

- **前端实现**：
  - `LoginDialog.tsx` - 登录/注册弹窗
    - 手机号输入 + 国家/地区选择器
    - 6位验证码输入（自动跳转下一个输入框）
    - 发送验证码按钮（60秒倒计时）
    - 开发环境自动显示验证码（蓝色调试框 + 黄色提示框）

  - 扩展 `userStore.ts` - JWT token 管理
    - `accessToken` / `refreshToken` / `tokenExpiresAt`
    - `isAuthenticated` - 登录状态
    - `sendVerificationCode()` - 发送验证码
    - `loginWithPhone()` - 手机验证码登录
    - `refreshToken()` - 刷新 access token
    - 使用 Zustand persist 中间件持久化 token

  - 扩展 `api.ts` - 认证 API
    - `sendVerificationCode()` - 发送验证码
    - `verifyCodeAndLogin()` - 验证登录
    - `refreshTokenApi()` - 刷新 token
    - `getHeaders()` - 优先使用 JWT，回退到 X-User-ID

  - 更新 `SidebarUserSection.tsx` - 支持未登录状态
    - 未登录：显示登录按钮
    - 已登录：显示用户头像、用户名、套餐信息

  - 更新 `GlowingInput.tsx` - 登录检查
    - 未登录：点击复杂模式按钮自动打开登录弹窗
    - 已登录：正常切换到复杂模式

### 🐛 Bug 修复

**数据库迁移修复**：
- 问题：SQLite 不支持 `ALTER TABLE ADD COLUMN` 时直接添加 `UNIQUE` 约束
- 错误：`sqlite3.OperationalError: Cannot add a UNIQUE column`
- 修复：分两步 - 先添加列，再创建唯一索引
- 影响：迁移成功执行，User 表认证字段正确创建

**后端导入修复**：
- 问题：`auth.py` 中使用 `timedelta` 但未导入
- 错误：`NameError: name 'timedelta' is not defined`
- 修复：`from datetime import datetime, timedelta`
- 影响：token 过期时间计算正确

**前端 CORS 修复**：
- 问题：前端直接访问 `http://localhost:3002`，导致 CORS 错误
- 修复：统一使用相对路径（`/api/*`），通过 Vite 代理转发
- 修改文件：`userStore.ts`, `useExpertStream.ts`
- 影响：CORS 问题解决，API 调用正常

**登录成功后 UI 更新修复**：
- 问题：登录成功后弹窗未正确关闭，页面有遮罩感
- 修复：
  - 优化 `loginWithPhone`：先保存 token，再获取用户信息
  - 即使用户信息获取失败，也会设置基本用户信息和 `isAuthenticated: true`
  - 优化 `LoginDialog` 关闭时序：添加 100ms 延迟确保状态已更新
- 影响：登录成功后弹窗平滑关闭，UI 立即更新为已登录状态

### 🔒 安全性

**验证码安全**：
- 验证码有效期：5 分钟
- 验证码长度：6 位数字
- 验证码存储：加密存储在数据库
- 验证码验证：使用常量时间比较，防止时序攻击

**JWT Token 安全**：
- Access Token 过期时间：30 天
- Refresh Token 过期时间：60 天
- Token 签名：HS256 算法
- Secret Key：从环境变量 `JWT_SECRET_KEY` 读取

### 📊 统计数据

- **新增文件**：6 个
- **修改文件**：8 个
- **代码变更**：+800 行，-150 行
- **数据库变更**：User 表新增 13 个字段，创建 4 个唯一索引

### 🧪 测试

**功能测试**：
- ✅ 发送验证码功能正常
- ✅ 验证码验证登录功能正常
- ✅ JWT token 生成和验证正常
- ✅ Token 刷新功能正常
- ✅ 登录成功后 UI 自动更新
- ✅ 未登录状态点击复杂模式按钮打开登录弹窗
- ✅ 登录弹窗关闭和状态重置正常

---

## 2026-01-24：UI优化与Bug修复

### 🎨 UI/UX 改进

**侧边栏优化**：
- 最近会话标题限制为10个字符，超出显示 `...`
- 用户名限制为4个字符，超出显示 `...`
- 添加 `title` 属性显示完整内容（鼠标悬停）
- 侧边栏收拢/展开按钮位置优化
  - 参考移动端原生展开收拢方式
  - 按钮固定在侧边栏右边缘（left-[72px/248px]）
  - 垂直位置：top-6（24px顶部间距）
  - 水平间距：按钮与侧边栏保持8px间距
  - 收拢/展开时按钮始终紧跟侧边栏
  - 完全避免内容溢出遮挡问题
- 恢复三横按钮样式（Menu 图标）
- 移除 Sidebar 内部的收拢/展开按钮，统一由 AppLayout 管理

**侧边栏样式统一**：
- 最近会话图标尺寸：`w-4 h-4` → `w-5 h-5`（与主菜单一致）
- 图标-文字间距：`gap-2` → `gap-3`（与主菜单一致）
- 图标对齐：`items-start` → `items-center`（与主菜单一致）
- 内边距：`p-2` → `px-3 py-2`（与主菜单一致）

### 🐛 Bug 修复

**Artifact 显示问题修复**：
- 简单模式点击预览卡片不重复添加 artifact
  - 检查专家会话是否已存在
  - 存在则只选中，不存在才添加新 artifact
  - 避免每次点击都生成新的标签页
- 移除 markdown artifact 类型
  - 代码块和 HTML 有明确标记，可以检测
  - markdown 文档没有明确标记，容易误判
  - 简单模式下 AI 回复本身就是 markdown，应直接显示
  - 修复：AI 回复的第一条消息现在会正确显示在 FloatingChatPanel 中
  - 移除错误判定，避免消息被展示在 artifact 区域
- 简化渲染逻辑：先显示文本内容，再显示 artifact 预览卡片

**CanvasChatPage 方法名修复**：
- 修复 `clearArtifactSessions` 方法名不匹配问题（改为 `clearSessions`）
- 修复 `selectArtifactSession` 不在 `ArtifactContextType` 中的问题（改为 `selectExpert`）
- 修复：简单模式下刷新页面后 artifact 和消息丢失的问题

### 📊 统计数据

- **修改文件数**：12 个
- **代码变更**：+274 行，-296 行
- **新增文件**：1 个（CHANGELOG.md）
- **删除文件**：2 个（测试脚本）

---

## 2026-01-24：代码清理与UI优化

### 🧹 代码清理

**后端测试脚本删除**：
- 删除10个后端测试脚本文件
- 保持项目目录整洁，避免混淆

**调试日志清理**：
- 后端：清理30+处调试日志
  - 移除HTTP请求日志中间件
  - 移除LLM流式响应日志
  - 移除智能体创建/删除/查询日志
  - 移除聊天请求详情日志
  - 移除SSE流式处理日志
- 前端：清理20+处调试日志
  - store/chatStore.ts：移除消息操作日志
  - hooks/useChat.ts：移除发送消息和ID更新日志
  - services/api.ts：移除请求和SSE数据日志
  - hooks/useArtifactListener.ts：移除SSE连接日志
  - components/CanvasChatPage.tsx：移除会话加载日志
  - components/FloatingChatPanel.tsx：移除模式切换和渲染日志
- 保留关键日志：应用错误、HTTP错误、未处理异常的堆栈跟踪

### 🎨 UI 优化

**侧边栏图标对齐**：
- 移除最近会话记录图标的 `mt-0.5` 上边距
- 图标与上方功能菜单图标保持一致的垂直对齐

**默认助手卡片简化**：
- 移除默认助手卡片的渐变色装饰点
- 改为纯色 `bg-slate-400 dark:bg-slate-600`
- 更加简洁低调，不抢视觉焦点

**移动端侧边栏优化**：
- 隐藏所有收拢/展开按钮（添加 `hidden lg:flex`）
- 移动端侧边栏只能以展开模式显示
- 侧边栏显示/隐藏由原生汉堡菜单和遮罩层控制
- 分隔线在移动端隐藏

### 🐛 Bug 修复

**Sidebar组件语法错误**：
- 问题：`SidebarUserSection` 组件使用错误的闭合标签 `>`
- 修复：改为正确的自闭合标签 `/>`
- 影响：构建成功，无编译错误

---

## 2026-01-24：会话ID不一致性修复与历史页面展示优化

### 🐛 Bug 修复

**会话ID不一致性修复**：
- 问题：在首页简单模式下连续发送消息，系统创建了三个不同的会话ID，而不是使用一个一致的ID。
- 原因：会话ID传递链断裂。首页生成的ID未正确设置到全局状态（chatStore）中，导致后续消息发送时使用了不一致的ID。
- 修复：在首页导航前显式设置store ID；在聊天页初始化逻辑中确保store ID与URL ID一致；在处理自动发送消息（startWith）时再次验证ID同步。
- 修改文件：
  - `frontend/src/components/HomePage.tsx`：在 `handleAgentClick` 和 `handleSendMessage` 中添加 `setCurrentConversationId`
  - `frontend/src/components/CanvasChatPage.tsx`：初始化时设置ID，自动发送消息前检查同步
  - `frontend/src/components/ChatPage.tsx`：自动发送消息前检查store ID与URL ID是否一致
  - `frontend/src/components/HistoryPage.tsx`：移除按agent分组逻辑，改为平铺列表展示

**历史页面展示修复**：
- 移除按agent分组的复杂逻辑，恢复为简单的平铺列表展示。
- 确保所有会话记录按时间顺序显示，点击进入对应完整对话历史。

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
