import { useRef, useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Bot, User, Minimize2, Maximize2 } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import type { Message } from '@/store/chatStore'
import GlowingInput from './GlowingInput'

interface FloatingChatPanelProps {
  className?: string
  messages: Message[]
  inputMessage: string
  setInputMessage: (value: string) => void
  handleSendMessage: (message: string) => void
  isTyping: boolean
  agentName?: string
  agentDescription?: string
  viewMode?: 'chat' | 'preview'
  onViewModeChange?: (mode: 'chat' | 'preview') => void
  isChatMinimized?: boolean
  setIsChatMinimized?: (minimized: boolean) => void
}

export default function FloatingChatPanel({
  className,
  messages,
  inputMessage,
  setInputMessage,
  handleSendMessage,
  isTyping,
  agentName = 'AI Assistant',
  agentDescription = '任务拆解助手',
  viewMode = 'chat',
  onViewModeChange,
  isChatMinimized: propIsChatMinimized = false,
  setIsChatMinimized: propSetIsChatMinimized
}: FloatingChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isChatMinimized, setIsChatMinimized] = useState(false)

  // Use parent's state if provided, otherwise use local state
  const effectiveIsChatMinimized = propSetIsChatMinimized ? propIsChatMinimized : isChatMinimized
  const effectiveSetIsChatMinimized = propSetIsChatMinimized || setIsChatMinimized

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (inputMessage.trim() && !isTyping) {
      handleSendMessage(inputMessage)
    }
  }, [inputMessage, isTyping, handleSendMessage])

  // Get current agent from store
  const { getCurrentAgent } = useChatStore()
  const currentAgent = getCurrentAgent()
  const displayName = currentAgent?.name || agentName
  const displayDescription = currentAgent?.description || agentDescription

  // 聊天面板收起时显示的机器人恢复按钮（内部版本，未被使用）
  const MinimizedChatView = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-violet-500 to-blue-600 rounded-2xl shadow-2xl flex items-center justify-center cursor-pointer hover:scale-105 transition-transform z-[100] animate-pulse"
      onClick={() => effectiveSetIsChatMinimized(false)}
      title="恢复对话"
    >
      <Bot className="w-6 h-6 text-white" />
      {messages.length > 0 && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
          {messages.length}
        </div>
      )}
    </motion.div>
  )

  return (
    <>
      {/* 机器人恢复按钮：仅当聊天面板收起时显示 */}
      {effectiveIsChatMinimized && <MinimizedChatView />}

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{
              opacity: effectiveIsChatMinimized ? 0 : 1,
              x: effectiveIsChatMinimized ? '120%' : 0
            }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={cn(
              'flex flex-col h-full pt-[env(safe-area-inset-top)]',
              effectiveIsChatMinimized && 'md:translate-x-[120%] md:opacity-0 pointer-events-none',
              className
            )}
          >
      {/* Header - Sticky with backdrop blur */}
      <div className="sticky top-0 z-20 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* 左侧：智能体信息 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {displayName}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {displayDescription}
              </p>
            </div>
          </div>

          {/* 右侧：PC端最小化按钮 + 移动端切换器 */}
          <div className="flex items-center gap-2">
            {/* PC端收起按钮 */}
            <button
              onClick={() => effectiveSetIsChatMinimized(true)}
              className="hidden md:flex p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="收起"
            >
              <Minimize2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>

            {/* 移动端专用切换器 (md:hidden) */}
            {onViewModeChange && (
              <div className="md:hidden flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg w-28">
                <button
                  onClick={() => onViewModeChange('chat')}
                  className={`flex-1 text-[11px] py-1 rounded-md transition-all ${viewMode === 'chat' ? 'bg-white dark:bg-slate-700 shadow-sm font-bold text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  对话
                </button>
                <button
                  onClick={() => onViewModeChange('preview')}
                  className={`flex-1 text-[11px] py-1 rounded-md transition-all ${viewMode === 'preview' ? 'bg-white dark:bg-slate-700 shadow-sm font-bold text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  产物
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4">
          {messages.filter(msg => msg.content.trim() !== '').map((msg, index) => (
            <motion.div
              key={msg.id || index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                  msg.role === 'user'
                    ? 'bg-indigo-600'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-500'
                )}
              >
                {msg.role === 'user' ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl p-4 shadow-sm',
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-900/20'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                )}
              >
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap text-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    {msg.content}
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {/* Typing Indicator */}
          {isTyping && messages.filter(m => m.role === 'assistant' && m.content.trim() !== '').length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4">
                <div className="flex items-center gap-1">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="w-2 h-2 bg-gray-400 rounded-full"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                    className="w-2 h-2 bg-gray-400 rounded-full"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                    className="w-2 h-2 bg-gray-400 rounded-full"
                  />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200/50 dark:border-gray-700/50">
        <GlowingInput
          value={inputMessage}
          onChange={setInputMessage}
          onSubmit={handleSubmit}
          placeholder="描述你的任务，AI 会帮你拆解..."
          disabled={isTyping}
          isTyping={isTyping}
        />
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
