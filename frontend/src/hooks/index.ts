/**
 * Hooks 统一导出
 */

// ============================================================================
// React Query Hooks - 服务端状态管理
// ============================================================================
export {
  // Chat History
  useChatHistoryQuery,
  useDeleteConversationMutation,
  chatHistoryKeys,
} from './queries'

// 聊天相关
export { useChat } from './useChat'
export { useChatCore } from './chat/useChatCore'
export { useConversation } from './chat/useConversation'

// 主题相关
// 主题初始化组件（读写主题用 useThemeStore）
export { ThemeInitializer } from './useTheme'

// 移动端滑动返回
export { useSwipeBack } from './useSwipeBack'

// 弹窗 Escape 关闭
export { useEscapeToClose } from './useEscapeToClose'

// ============================================================================
// 性能优化 Selectors
// 使用 Zustand Selector 模式避免不必要的重渲染
// 特别适用于高频 SSE 更新场景
// ============================================================================

// TaskStore Selectors
export {
  // 只导出**有真实消费者**的 selector。此前那批针对 tasks/tasksCache/
  // executionPlan/artifacts 的 selector 零组件消费者，已随本地任务副本一并移除
  // ——任务与产物以服务端为唯一真相（/threads、/artifacts、/run/:id）。
  useTaskMode,
  useActiveRunId,
  useIsWaitingForApproval,
  usePendingPlan,
  usePlanRevising,
  usePendingPlanVersion,
  usePendingRunId,
  useRunningTaskIds,
  useTaskActions,
} from './useTaskSelectors'

// ChatStore Selectors
export {
  // 基础 Selectors
  useCurrentConversationId,
  useInputMessage,
  useIsGenerating,

  // 复杂 Selectors
  useMessages,

  // Actions
  useChatActions,
  useAddMessageAction,
  useSetInputMessageAction,
} from './useChatSelectors'

// ============================================================================
// AuthStore Selectors
// ============================================================================
// ============================================================================
// App UI Selectors（直接读 store，无 Context）
// ============================================================================
export { useAppUISelectors } from './useAppUISelectors'
