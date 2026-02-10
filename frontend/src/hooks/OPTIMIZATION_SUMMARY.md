# Zustand Selector 性能优化 - 实施总结

## 已完成的工作

### 1. 创建了优化的 Selector Hooks

#### `useTaskSelectors.ts`
- **基础 Selectors**: `useTaskMode`, `useSelectedTaskId`, `useIsWaitingForApproval` 等
- **复杂 Selectors**: `useTasksCache`, `useSelectedTask`, `useRunningTasks` (使用 `useShallow`)
- **Actions**: `useTaskActions` (稳定引用)
- **条件 Selectors**: `useTaskById`, `useIsTaskRunning`

#### `useChatSelectors.ts`
- **基础 Selectors**: `useIsGenerating`, `useInputMessage`, `useCurrentConversationId`
- **复杂 Selectors**: `useMessages`, `useLastMessage`, `useLastAssistantMessage`
- **Actions**: `useChatActions`, `useAddMessageAction` 等

### 2. 统一导出

在 `src/hooks/index.ts` 中统一导出所有 selectors，方便使用：

```tsx
import { 
  useIsWaitingForApproval, 
  useTaskActions,
  useIsGenerating 
} from '@/hooks'
```

### 3. 迁移指南和示例

- `SELECTORS_MIGRATION_GUIDE.md`: 详细的迁移指南
- `PlanReviewCard.optimized.tsx`: 优化后的组件示例

---

## 核心优化原理

### 问题：全量订阅

```tsx
// ❌ 每次 Store 变化都触发重渲染
const { isWaitingForApproval, pendingPlan } = useTaskStore()
```

### 解决：Selector 订阅

```tsx
// ✅ 只订阅需要的值
const isWaitingForApproval = useIsWaitingForApproval()
const pendingPlan = usePendingPlan()
```

### 性能对比

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 流式输出 (50 chunks) | 组件渲染 50 次 | 组件不渲染 |
| SSE 事件 (100 events) | 组件渲染 100 次 | 组件不渲染 |
| 任务状态更新 | 所有组件渲染 | 只有相关组件渲染 |

---

## 快速迁移指南

### 步骤 1: 识别需要优化的组件

使用 React DevTools Profiler 或添加 console.log：

```tsx
export function MyComponent() {
  console.log('[Render] MyComponent') // 观察这个输出的频率
  // ...
}
```

### 步骤 2: 替换全量订阅

```tsx
// 优化前
import { useTaskStore } from '@/store/taskStore'
const { isWaitingForApproval, pendingPlan, clearPendingPlan } = useTaskStore()

// 优化后  
import { 
  useIsWaitingForApproval, 
  usePendingPlan,
  useTaskActions 
} from '@/hooks'
const isWaitingForApproval = useIsWaitingForApproval()
const pendingPlan = usePendingPlan()
const { clearPendingPlan } = useTaskActions()
```

### 步骤 3: 验证优化效果

重新运行应用，观察：
1. 流式输出时组件是否还频繁渲染
2. 打字时输入框是否更跟手
3. CPU 占用率是否降低

---

## 推荐优先优化的组件

根据使用频率和更新频率，建议按以下顺序优化：

1. **ChatStreamPanel** - 高频更新，流式输出核心组件
2. **OrchestratorPanelV2** - 任务状态展示
3. **BusRail** / **ExpertRail** - 任务卡片列表
4. **PlanReviewCard** - HITL 交互组件
5. **useConversation hook** - 会话管理

---

## 最佳实践

### DO ✅

```tsx
// 使用专门的 selector
const mode = useTaskMode()

// Actions 使用稳定引用
const { selectTask } = useTaskActions()

// 复杂对象使用 useShallow
const stats = useTaskStats()

// 单个 action 使用专用 hook
const addMessage = useAddMessageAction()
```

### DON'T ❌

```tsx
// 避免全量订阅
const { mode } = useTaskStore()

// 避免在组件内计算派生数据
const { tasks } = useTaskStore()
const runningCount = tasks.filter(t => t.status === 'running').length

// 避免每次返回新对象
const stats = useTaskStore(state => ({
  total: state.tasksCache.length,
  running: state.runningTaskIds.size
})) // 没有 useShallow！
```

---

## 预期收益

根据 Gemini 的分析和 Zustand 官方文档，实施此优化后：

1. **打字跟手度**: 减少 80-90% 的无效渲染
2. **流式输出流畅度**: 侧边栏/任务列表保持静止
3. **电池寿命**: 降低 CPU 占用率
4. **用户体验**: 界面响应更迅速，无卡顿感

---

## 下一步行动

1. [ ] 按优先级逐个迁移组件
2. [ ] 使用 Profiler 验证每个组件的优化效果
3. [ ] 建立团队规范：新组件必须使用 Selector 模式
4. [ ] 考虑在 CI 中添加性能检测（如渲染次数监控）

---

## 参考资源

- [Zustand Selectors 文档](https://github.com/pmndrs/zustand#selecting-multiple-state-slices)
- [React 性能优化最佳实践](https://react.dev/reference/react/memo)
- 项目内文档: `SELECTORS_MIGRATION_GUIDE.md`
