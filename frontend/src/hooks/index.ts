/**
 * Hooks 统一导出
 */

// ============================================================================
// React Query Hooks - 服务端状态管理
// ============================================================================
export {
  useChatHistoryQuery,
  useChatSessionQuery,
  useDeleteConversationMutation,
  useRecentConversationsQuery,
  chatHistoryKeys,
} from './queries'

// 聊天相关
export { useChat } from './useChat'

export { useChatCore } from './chat/useChatCore'
export { useExpertHandler } from './chat/useExpertHandler'
export { useConversation } from './chat/useConversation'

// 主题相关
export { useTheme } from './useTheme'

// 移动端滑动返回
export { useSwipeBack } from './useSwipeBack'

// 异步错误处理
export { useAsyncError } from './useAsyncError'

// ============================================================================
// 🔥🔥🔥 性能优化 Selectors (v3.1.0)
// 使用 Zustand Selector 模式避免不必要的重渲染
// 特别适用于高频 SSE 更新场景
// ============================================================================

// TaskStore Selectors
export {
  // 基础 Selectors
  useTaskMode,
  useTaskSession,
  useSelectedTaskId,
  useTaskInitialized,
  useIsWaitingForApproval,
  usePendingPlan,
  useRunningTaskIds,
  useTasksCacheVersion,
  
  // 复杂 Selectors (useShallow)
  useTasksCache,
  useTasksMap,
  useSelectedTask,
  useRunningTasks,
  useTaskStats,
  
  // Actions
  useTaskActions,
  useSelectTaskAction,
  useClearTasksAction,
  useInitializePlanAction,
  useSetModeAction,
  
  // 条件 Selectors
  useTaskById,
  useIsTaskRunning,
  useTaskArtifacts,
} from './useTaskSelectors'

// ChatStore Selectors
export {
  // 基础 Selectors
  useCurrentConversationId,
  useInputMessage,
  useIsGenerating,
  useIsTyping,
  useSelectedAgentId,
  
  // 复杂 Selectors
  useMessages,
  useLastMessage,
  useLastAssistantMessage,
  useCustomAgents,
  
  // Actions
  useChatActions,
  useAddMessageAction,
  useUpdateMessageAction,
  useSetGeneratingAction,
  useSetInputMessageAction,
  
  // 派生 Selectors
  useMessageStats,
  useHasMessages,
  useMessageCount,
} from './useChatSelectors'
