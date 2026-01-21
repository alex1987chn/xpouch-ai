# 开发备忘录 (MEM)

## [2025-01-XX] 性能优化 & 交互改进

### 🎯 性能瓶颈分析

#### 问题 1: FloatingExpertBar 像素网格图标
**发现**: 每个专家图标使用 4x4 网格（16 个 div），7 个专家 = 112 个额外 DOM 元素
**影响**: 
- 严重增加 DOM 树深度
- `animate-pulse` 持续触发重绘
- `transition-all` 触发昂贵的重排计算

**解决方案**: 
- 简化为单个 div + Emoji
- 减少 87.5% 的 DOM 节点
- 只对活跃状态使用 `animate-pulse`
- `transition-all` → `transition-opacity`

**教训**: 精美的视觉效果不应以性能为代价，使用 Emoji 替代复杂的 DOM 结构

---

#### 问题 2: 过度的 motion 动画
**发现**: 多处使用嵌套的 `AnimatePresence` 和 `motion.div`
**影响**: 
- 每次状态变化都触发复杂的动画计算
- 布局动画（`popLayout`）特别昂贵
- 不必要的动画消耗 CPU/GPU

**解决方案**:
- 移除非关键动画（Artifact 内容区）
- 保留用户交互动画（Modal 弹窗）
- 使用 CSS transition 替代简单的 opacity 动画

**教训**: 动画应该服务于用户感知，不是所有地方都需要动画

---

#### 问题 3: 布局比例不明确
**发现**: 使用 `w-full` 导致对话面板宽度不确定
**影响**:
- 布局不稳定
- 用户体验不一致

**解决方案**: 
- 使用 Tailwind 的 `flex-[7]` 和 `flex-[3]`
- 固定 70% : 30% 的布局比例

**教训**: 明确的布局比例比自适应更重要

---

### 🎨 交互设计决策

#### 参考 ChatGPT/DeepSeek 的消息交互
**决策点**: 操作按钮应该放在哪里？

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| 按钮在气泡下方 | 简单实现 | 需要精确鼠标移动 | ❌ |
| 按钮在气泡右上角 | 悬停即可触发 | 实现稍复杂 | ✅ |

**最终设计**:
- 复制按钮：悬停时显示在气泡右上角
- 用户消息：复制 + 重新发送（气泡下方）
- 助手消息：复制 + 重新生成（都在右上角）

**技术实现**:
```tsx
<div className="group">  // 用于悬停检测
  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100">
    <button>复制</button>
  </div>
</div>
```

**教训**: 
- 悬停检测使用 `group` + `group-hover` 是最佳实践
- 毛玻璃效果 (`backdrop-blur-sm`) 提升视觉质感

---

### 📝 标题自定义需求

**用户反馈**: Artifact 和专家栏标题不应使用助手名称
**需求**: AI 可以返回自定义标题

**设计方案**:
```typescript
// 优先级
1. artifact.title (最高优先级)
2. expert.title
3. 默认专家名称 (回退值)
```

**实现位置**:
- `canvasStore.ts`: 添加可选的 `title` 字段
- `CanvasChatPage.tsx`: `getArtifactTitle()` 函数处理优先级
- `ExpertStatusBar.tsx`: 卡片和弹窗使用 `expert.title || config.name`

**教训**: 
- 向后兼容性很重要（title 为可选）
- 优先级链设计要清晰
- 回退值必须始终存在

---

### 🔧 开发经验总结

#### 1. DOM 数量优化
- **原则**: 减少 DOM 节点数量可以显著提升性能
- **方法**: 使用 Emoji 替代复杂的图标网格
- **效果**: 减少 87.5% 的 DOM 节点

#### 2. 动画使用原则
- **原则**: 动画应该服务于用户感知
- **保留**: 用户交互反馈（Modal、Hover）
- **移除**: 不影响感知的布局动画
- **替代**: CSS transition 替代简单的 JS 动画

#### 3. 布局稳定性
- **原则**: 明确的布局比例比自适应更重要
- **方法**: 使用 `flex-[数字]` 而非 `w-full`
- **效果**: 30% 对话面板，70% 主内容区

#### 4. 可访问性考虑
- **原则**: 焦点样式应该清晰但不突兀
- **实现**: `focus:outline-none` + `focus-visible:ring`
- **效果**: 键盘导航时显示焦点环，鼠标时不显示

---

### 📚 参考资料

#### Tailwind CSS Flex 比例
- `flex-[7]` = `flex: 7` (占 7 份)
- `flex-[3]` = `flex: 3` (占 3 份)
- 总计 = 10 份，70% : 30%

#### Framer Motion 性能
- `layout` 动画最昂贵（触发重排）
- `popLayout` 模式会计算所有子元素位置
- 使用 `AnimatePresence` 时要谨慎

#### React 优化
- 使用 `useCallback` 包装事件处理函数
- 使用 `useMemo` 计算复杂值
- 避免在渲染中创建新函数

---

### 🐛 已知问题

#### 1. 控制台日志
- **状态**: 前端 console.log 已移除
- **待处理**: 后端日志可能需要添加级别控制

#### 2. 全屏预览
- **状态**: 已移除嵌套 motion，性能应该改善
- **待测试**: 大型 Artifact 内容的渲染性能

---

## [之前版本]

- 初始版本开发记录
