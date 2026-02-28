/**
 * Hooks 统一导出
 */

// ============================================================================
// React Query Hooks - 服务端状态管理
// ============================================================================
export {
  // Chat History
  useChatHistoryQuery,
  useChatSessionQuery,
  useDeleteConversationMutation,
  useRecentConversationsQuery,
  chatHistoryKeys,
  // Agents
  useAgentsQuery,
  useCustomAgentsQuery,
  useDeleteAgentMutation,
  agentsKeys,
  type UIAgent,
} from './queries'

// 聊天相关
export { useChat } from './useChat'

export { useChatCore } from './chat/useChatCore'
// v3.2.0: useExpertHandler 已移除，事件处理由 eventHandlers.ts 直接处理
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
  useResetTasksAction,
  useResetAllAction,
  useInitializePlanAction,
  
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

// ============================================================================
// AuthStore Selectors
// ============================================================================
export {
  // 基础 Selectors
  useIsAuthenticated,
  useUser,
  useIsAuthLoading,
  
  // 复杂 Selectors
  useAuth,
  
  // 登录弹窗控制
  useLoginDialog,
} from './useAuthSelectors'
