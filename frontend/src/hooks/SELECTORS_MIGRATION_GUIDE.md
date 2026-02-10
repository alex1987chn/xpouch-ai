# Zustand Selector 性能优化迁移指南

## 概述

本指南帮助你将现有组件从全量订阅模式迁移到 Selector 优化模式，显著提升流式输出和 SSE 更新场景下的性能。

## 迁移前后对比

### ❌ Before: 全量订阅 (性能差)

```tsx
// PlanReviewCard.tsx - 优化前
import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'

export function PlanReviewCard() {
  // ❌ 订阅整个 Store，任何状态变化都会触发重渲染
  const { 
    isWaitingForApproval, 
    pendingPlan, 
    clearPendingPlan,
    setIsWaitingForApproval,
    setPendingPlan,
    updateTasksFromPlan
  } = useTaskStore()
  
  const { addMessage } = useChatStore()
  
  // 每次 Store 更新都会重新执行这些计算
  const hasPlan = pendingPlan.length > 0
  
  // ...
}
```

**问题分析：**
- `useTaskStore()` 返回整个 State 对象
- 当 `isGenerating` 变化时（每秒几十次），组件会完全重渲染
- 虽然 `pendingPlan` 没变，但组件仍然重新计算

### ✅ After: Selector 优化 (性能好)

```tsx
// PlanReviewCard.tsx - 优化后
import {
  useIsWaitingForApproval,
  usePendingPlan,
  useTaskActions,
} from '@/hooks/useTaskSelectors'
import { useAddMessageAction } from '@/hooks/useChatSelectors'

export function PlanReviewCard() {
  // ✅ 只订阅需要的值
  const isWaitingForApproval = useIsWaitingForApproval()
  const pendingPlan = usePendingPlan()
  
  // ✅ Actions 使用稳定的引用
  const { 
    clearPendingPlan,
    setIsWaitingForApproval,
    setPendingPlan,
    updateTasksFromPlan 
  } = useTaskActions()
  
  const addMessage = useAddMessageAction()
  
  // 计算逻辑保持不变
  const hasPlan = pendingPlan.length > 0
  
  // ...
}
```

**优化效果：**
- 只有当 `isWaitingForApproval` 或 `pendingPlan` 变化时才重渲染
- `isGenerating` 变化不会触发此组件重渲染
- 流式输出时，侧边栏保持静止

---

## 常见场景迁移示例

### 场景 1: 获取选中任务

```tsx
// ❌ Before
const { tasks, selectedTaskId } = useTaskStore()
const selectedTask = tasks.find(t => t.id === selectedTaskId)

// ✅ After
const selectedTask = useSelectedTask()
```

### 场景 2: 获取任务列表

```tsx
// ❌ Before
const { tasksCache } = useTaskStore()

// ✅ After
const tasksCache = useTasksCache()
```

### 场景 3: 获取多个 Actions

```tsx
// ❌ Before
const { selectTask, clearTasks, initializePlan } = useTaskStore()

// ✅ After
const { selectTask, clearTasks, initializePlan } = useTaskActions()
```

### 场景 4: 获取单个 Action

```tsx
// ❌ Before (订阅整个 Store)
const { selectTask } = useTaskStore()

// ✅ After (只订阅一个稳定的函数)
const selectTask = useSelectTaskAction()
```

### 场景 5: 检查任务是否运行中

```tsx
// ❌ Before
const { runningTaskIds } = useTaskStore()
const isRunning = runningTaskIds.has(taskId)

// ✅ After
const isRunning = useIsTaskRunning(taskId)
```

### 场景 6: 获取消息列表

```tsx
// ❌ Before
const { messages } = useChatStore()

// ✅ After
const messages = useMessages()
```

### 场景 7: 复杂状态组合

```tsx
// ❌ Before - 返回新对象导致每次都不相等
const { tasks, runningTaskIds } = useTaskStore()
const stats = {
  total: tasks.length,
  running: runningTaskIds.size
}

// ✅ After - useShallow 浅比较
const stats = useTaskStats()
```

---

## 性能对比测试

你可以使用 React DevTools Profiler 来验证优化效果：

```tsx
// 在优化前的组件上添加调试标记
export function PlanReviewCard() {
  console.log('[Render] PlanReviewCard')
  // ...
}
```

**预期效果：**
- **优化前**: 流式输出时每秒输出 10-20 次 `[Render] PlanReviewCard`
- **优化后**: 仅在 `pendingPlan` 或 `isWaitingForApproval` 变化时渲染

---

## 完整组件迁移示例

### OrchestratorPanelV2 优化

```tsx
// 优化前
export function OrchestratorPanelV2() {
  const mode = useTaskStore((state) => state.mode)
  const tasks = useTaskStore((state) => state.tasksCache)
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId)
  const selectTask = useTaskStore((state) => state.selectTask)
  
  // 每次 render 都执行 find
  const selectedTask = tasks.find(t => t.id === selectedTaskId)
  
  // ...
}

// 优化后
export function OrchestratorPanelV2() {
  const mode = useTaskMode()
  const tasks = useTasksCache()
  const selectedTask = useSelectedTask() // 自动处理 find 逻辑
  const selectTask = useSelectTaskAction()
  
  // ...
}
```

### ChatStreamPanel 优化

```tsx
// 优化前
export function ChatStreamPanel() {
  const mode = useTaskStore(state => state.mode)
  const runningTaskIds = useTaskStore(state => state.runningTaskIds)
  const tasks = useTaskStore(state => state.tasksCache)
  const estimatedSteps = useTaskStore(state => state.session?.estimatedSteps || 0)
  const isWaitingForApproval = useTaskStore(state => state.isWaitingForApproval)
  
  // ...
}

// 优化后
export function ChatStreamPanel() {
  const mode = useTaskMode()
  const runningTaskIds = useRunningTaskIds()
  const tasks = useTasksCache()
  const estimatedSteps = useTaskStore(state => state.session?.estimatedSteps || 0) // 内联仍适用
  const isWaitingForApproval = useIsWaitingForApproval()
  
  // ...
}
```

---

## 注意事项

### 1. Actions 的稳定性

所有 Actions 都使用 `useShallow`，返回的对象引用是稳定的，可以安全地用于 `useEffect` 依赖数组：

```tsx
const { selectTask } = useTaskActions()

useEffect(() => {
  // selectTask 引用稳定，不会导致无限循环
}, [selectTask])
```

### 2. 条件渲染优化

对于条件渲染场景，使用专门的 selector：

```tsx
// ❌ 订阅整个 Store 只为检查一个条件
const { mode } = useTaskStore()
if (mode === 'complex') { ... }

// ✅ 使用专门的 selector
const mode = useTaskMode()
if (mode === 'complex') { ... }
```

### 3. 派生数据

对于派生数据，保持 selector 的纯度：

```tsx
// ✅ 好的做法 - selector 内部不修改状态
const runningCount = useTaskStore(
  useShallow(state => state.runningTaskIds.size)
)

// ❌ 避免在 selector 中执行副作用
const bad = useTaskStore(state => {
  console.log('side effect') // 不要这样做
  return state.something
})
```

---

## 迁移检查清单

- [ ] 识别使用 `useTaskStore()` 全量订阅的组件
- [ ] 识别使用 `useChatStore()` 全量订阅的组件
- [ ] 优先优化高频更新的组件（流式输出、任务列表）
- [ ] 使用 Profiler 验证优化效果
- [ ] 确保 Actions 引用稳定

---

## 相关文档

- [Zustand Selectors 官方文档](https://github.com/pmndrs/zustand#selecting-multiple-state-slices)
- [useShallow 文档](https://github.com/pmndrs/zustand#shallow)
- React DevTools Profiler 使用指南
