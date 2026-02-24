/**
 * =============================
 * React Query Hooks 入口
 * =============================
 *
 * 集中管理所有与服务器状态相关的 React Query Hooks
 *
 * [使用原则]
 * 1. 数据获取优先使用 React Query（服务端状态）
 * 2. UI 状态使用 Zustand（客户端状态）
 * 3. 绝不用 useEffect 做数据获取
 */

export {
  // Chat History Queries
  useChatHistoryQuery,
  useChatSessionQuery,
  useDeleteConversationMutation,
  useRecentConversationsQuery,
  chatHistoryKeys,
} from './useChatHistoryQuery'

export {
  // Agents Queries
  useAgentsQuery,
  useCustomAgentsQuery,
  useDeleteAgentMutation,
  agentsKeys,
  type UIAgent,
} from './useAgentsQuery'

export {
  // MCP Queries
  useMCPServers,
  useCreateMCP,
  useToggleMCP,
  useDeleteMCP,
  mcpKeys,
} from './useMCPQuery'
