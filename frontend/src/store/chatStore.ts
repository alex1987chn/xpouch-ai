import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type ExpertMessageData, type Message } from '@/types'
import { generateUUID } from '@/utils/uuid'
import { isSameId } from '@/utils/normalize'

/**
 * ChatStore - 聊天状态管理
 *
 * [职责边界]
 * ✅ 当前活跃对话的实时状态（messages, isGenerating）
 * ✅ 用户输入状态（inputMessage）
 * ✅ 智能体选择状态（selectedAgentId）
 *
 * ❌ 不负责服务端数据缓存（由 React Query 处理）
 *   - 会话列表 → useChatHistoryQuery
 *   - 智能体列表 → useCustomAgentsQuery
 * 
 * [性能优化]
 * - lastAssistantMessageId: 缓存最后一条助手消息 ID，避免 EventHandler 遍历查找
 */

// ============================================================================
// Types
// ============================================================================

interface ChatState {
  // 聊天相关
  messages: Message[]
  currentThreadId: string | null
  inputMessage: string

  // 生成状态
  isGenerating: boolean

  // 🔥 性能优化：缓存最后一条助手消息 ID
  lastAssistantMessageId: string | null
}

interface ChatActions {
  // 消息操作
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string, append?: boolean) => void
  updateMessageMetadata: (id: string, metadata: Partial<Message['metadata']>) => void
  updateMessageExtra: (id: string, extra: Partial<ExpertMessageData>) => void
  
  // 输入状态
  setInputMessage: (input: string) => void
  
  // 会话状态
  setCurrentThreadId: (id: string | null) => void
  
  // 生成状态
  setGenerating: (value: boolean) => void
}

type ChatStore = ChatState & ChatActions

// ============================================================================
// Store Factory
// ============================================================================

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      // ========== 初始状态 ==========
      messages: [],
      currentThreadId: null,
      inputMessage: '',
      isGenerating: false,
      lastAssistantMessageId: null,

      // ========== 智能体操作 ==========

      // （智能体列表的唯一真相是 React Query —— useAgentsQuery；
      //   此前 persisted customAgents 副本已删除，见 v3.4.4 缓存所有权收敛）

      // ========== 消息操作 ==========
      
      setMessages: (messagesOrUpdater) => set((state) => {
        const newMessages = typeof messagesOrUpdater === 'function'
          ? messagesOrUpdater(state.messages)
          : messagesOrUpdater
        return { messages: newMessages }
      }),

      addMessage: (message: Message) => set((state) => {
        const newMessage = { ...message, id: message.id || generateUUID(), timestamp: Date.now() }

        // P4-1 会话归属守卫：若消息标注了发起会话而当前会话已切换，则丢弃
        // （修复流式中途切换会话后，错误气泡/系统消息串入新会话）
        if (
          message.metadata?.threadId &&
          state.currentThreadId &&
          message.metadata.threadId !== state.currentThreadId
        ) {
          return {}
        }

        const newMessages = [...state.messages, newMessage]

        // 🔥 性能优化：更新 lastAssistantMessageId
        const updates: Partial<ChatState> = { messages: newMessages }
        if (message.role === 'assistant') {
          updates.lastAssistantMessageId = newMessage.id
        }

        return updates
      }),

      updateMessage: (id: string, content: string, append?: boolean) => set((state) => ({
        messages: state.messages.map((msg) => {
          // 🔥 使用规范化工具比较 ID
          if (isSameId(msg.id, id)) {
            const newContent = append ? (msg.content || '') + content : content
            return { ...msg, content: newContent }
          }
          return msg
        })
      })),

      updateMessageMetadata: (id: string, metadata: Partial<Message['metadata']>) => set((state) => ({
        messages: state.messages.map((msg) => {
          // 🔥 使用规范化工具比较 ID
          if (isSameId(msg.id, id)) {
            return { 
              ...msg, 
              metadata: { ...msg.metadata, ...metadata }
            }
          }
          return msg
        })
      })),
      updateMessageExtra: (id: string, extra: Partial<ExpertMessageData>) => set((state) => ({
        messages: state.messages.map((msg) =>
          isSameId(msg.id, id)
            ? { ...msg, extra_data: { ...(msg.extra_data as Record<string, unknown>), ...extra } as Message['extra_data'] }
            : msg
        ),
      })),

      // ========== 输入状态 ==========
      
      setInputMessage: (input: string) => set({ inputMessage: input }),

      // ========== 会话状态 ==========
      
      setCurrentThreadId: (id: string | null) => set({ currentThreadId: id }),

      // ========== 生成状态 ==========

      setGenerating: (value: boolean) => set({ isGenerating: value })
    }),
    {
      name: 'xpouch-chat-store',
      // 只持久化轻量 UI 偏好。messages / currentThreadId 不再持久化：
      // 会话内容由服务端恢复（useSessionRestore），持久化副本只会造成
      // 导航时旧数据闪烁（历史上被迫加"导航清空"hack 的根源）。
      partialize: () => ({
        // 轻量 UI 偏好在此持久化
      })
    }
  )
)
