# 更新日志

## [2025-01-XX] 性能优化 & 交互改进

### 🚀 性能优化

#### FloatingExpertBar - 像素网格图标优化
- **问题**: 每个图标使用 4x4 网格（16 个 div），7 个专家 = 112 个 DOM 元素
- **优化**: 简化为单个 div + Emoji，减少约 87.5% 的 DOM 节点
- **移除**: `transition-all duration-300` → `transition-opacity duration-200`
- **移除**: 所有图标的 `animate-pulse` → 仅对活跃状态使用
- **结果**: 大幅提升页面渲染性能，减少卡顿

#### ExpertStatusBar - 移除布局动画
- **移除**: `AnimatePresence mode="popLayout"`
- **优化**: 直接渲染 ExpertCard，移除昂贵的布局动画计算
- **结果**: 减少动画计算开销

#### CanvasChatPage - 移除多处 motion 组件
- **移除**: Artifact 内容区的嵌套 `motion.div`
- **移除**: Artifact 标题栏的 `motion.div`
- **移除**: Artifact 全屏预览的 `AnimatePresence` + 双层 `motion.div`
- **移除**: 专家预览弹窗的 `AnimatePresence`
- **保留**: ExpertPreviewModal 的 motion（用户交互需要平滑过渡）
- **结果**: 减少不必要的动画计算，提升交互流畅度

#### 布局比例优化
- **问题**: 对话面板没有固定的 30% 宽度比例
- **优化**: 使用 `flex-[7]` 和 `flex-[3]` 设置 70% : 30% 的布局
- **结果**: 左侧（专家栏 + Artifact）占 70%，右侧（对话面板）占 30%

---

### 🎨 交互改进

#### 聊天消息操作（参考 ChatGPT/DeepSeek）
- **复制按钮**: 悬停时显示在消息气泡右上角
- **用户消息**: 复制 + 重新发送按钮
- **助手消息**: 复制 + 重新生成按钮
- **图标更新**: `RefreshCw` → `RotateCcw`（逆时针旋转，更符合"重新"语义）
- **视觉效果**: 毛玻璃背景 `backdrop-blur-sm`，悬停高亮
- **交互流程**: 
  - 用户消息悬停 → 右上角显示复制，下方显示重新发送
  - 助手消息悬停 → 右上角显示复制 + 重新生成

#### 专家状态栏卡片
- **移除**: 选中时的蓝环效果（`ring-2 ring-indigo-500`）
- **优化**: 仅保留绿色边框，视觉效果更统一
- **可访问性**: 添加 `focus-visible` 焦点样式，仅键盘导航时显示焦点环

#### Artifact 标题自定义
- **新增**: `ExpertResult.title` 字段（AI 返回的自定义标题）
- **新增**: `artifact.title` 字段（Artifact 的自定义标题）
- **优先级**: Artifact 标题 > ExpertResult 标题 > 默认专家名称
- **应用位置**: 
  - Artifact 标题栏
  - Artifact 全屏预览
  - 专家状态栏卡片
  - 专家预览弹窗
- **结果**: 不再使用助手名称作为标题，支持 AI 返回自定义标题

---

### 📋 UI/UX 改进

#### 消息气泡交互
- **悬停显示**: 操作按钮仅在悬停时显示
- **定位优化**: 复制按钮在气泡右上角
- **状态反馈**: 复制成功显示 ✓ 图标 2 秒
- **主题适配**: 用户消息蓝色主题，助手消息灰色主题

#### 对话面板布局
- **固定比例**: 30% 宽度，与其他 70% 区域形成对比
- **移动端**: 保持全屏显示，PC 端固定比例

---

### 🔧 技术改进

#### 移除 console.log
- **前端**: 移除所有调试日志
- **结果**: 减少垃圾回收压力，提升运行时性能

#### 类型定义更新
- **canvasStore.ts**: 添加 `title?: string` 到 ExpertResult
- **canvasStore.ts**: 添加 `title?: string` 到 Artifact 类型
- **向后兼容**: `title` 为可选字段，未提供时使用默认值

---

## [之前版本]

### 初始功能
- XPouch 布局组件
- 浮动专家栏
- 浮动聊天面板
- 专家状态栏
- Artifact 显示组件
- Canvas 聊天页面
