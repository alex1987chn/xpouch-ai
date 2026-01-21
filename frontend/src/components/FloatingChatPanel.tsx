import { useRef, useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Bot, User, Minimize2, Maximize2, Copy, Check, RotateCcw, MoreVertical } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import type { Message } from '@/store/chatStore'
import GlowingInput from './GlowingInput'
import { useTranslation } from '@/i18n'

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
  onStopGeneration?: () => void
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
  setIsChatMinimized: propSetIsChatMinimized,
  onStopGeneration
}: FloatingChatPanelProps) {
  const { t } = useTranslation()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isMinimized, setIsMinimized] = useState(false)

  // Use parent's state if provided, otherwise use local state
  const effectiveIsChatMinimized = propSetIsChatMinimized ? propIsChatMinimized : isMinimized
  const effectiveSetIsChatMinimized = propSetIsChatMinimized || setIsMinimized

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
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

  // Copy functionality
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)

  const handleCopyMessage = useCallback(async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  const handleRetryMessage = useCallback((content: string) => {
    setInputMessage(content)
    // Focus on input
    const inputElement = document.querySelector('textarea') as HTMLTextAreaElement
    if (inputElement) {
      inputElement.focus()
    }
  }, [setInputMessage])

  const handleRegenerate = useCallback(() => {
    // 重新生成上一条助手消息
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      setInputMessage(lastUserMsg.content)
    }
  }, [messages, setInputMessage])

  return (
    <>
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
              'flex flex-col h-full min-h-0 overflow-hidden',
              effectiveIsChatMinimized && 'md:translate-x-[120%] md:opacity-0 pointer-events-none'
            )}
          >
      {/* Header - Fixed at top, flex-shrink-0 */}
      <div className="flex-shrink-0 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 px-4 py-3">
        <div className="flex items-center gap-3 flex-1">
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
          <div className="flex items-center justify-end flex-1">
            {/* PC端收起按钮 - 靠右边缘 */}
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

      {/* Messages - flex-1 + overflow-y-auto for scrolling */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 scrollbar-thin">
        <div className="space-y-4">
          {messages.filter(msg => msg.content.trim() !== '').map((msg, index) => (
            <motion.div
              key={msg.id || index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'flex-col items-end' : 'flex-col items-start'
              )}
            >
              {/* Avatar + Message Bubble Row */}
              <div className={cn('flex gap-3 w-full', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
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

                {/* Message Bubble with Action Button */}
                <div
                  className={cn(
                    'relative max-w-[80%] rounded-2xl p-4 shadow-sm group',
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-900/20'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                  )}
                >
                  {/* Content */}
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap text-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                      {msg.content}
                    </div>
                  )}

                  {/* Action Button - Hover to show at top right */}
                  <div
                    className={cn(
                      'absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
                      msg.role === 'user' ? 'flex-row' : 'flex-row'
                    )}
                  >
                    {/* Copy Button */}
                    <button
                      onClick={() => handleCopyMessage(msg.content, msg.id || String(index))}
                      className={cn(
                        'p-1.5 rounded-lg transition-colors text-xs backdrop-blur-sm',
                        msg.role === 'user'
                          ? 'hover:bg-indigo-400/30 bg-indigo-500/20 text-white'
                          : 'hover:bg-gray-200/80 dark:hover:bg-gray-700/80 bg-gray-200/50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300'
                      )}
                      title={t('copy')}
                    >
                      {copiedMessageId === (msg.id || String(index)) ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Regenerate Button (Only for assistant messages) */}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={handleRegenerate}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors text-xs backdrop-blur-sm',
                          'hover:bg-gray-200/80 dark:hover:bg-gray-700/80 bg-gray-200/50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300'
                        )}
                        title={t('regenerate')}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Button for User Messages - On hover */}
              {msg.role === 'user' && (
                <div className="flex gap-1 opacity-0 hover:opacity-100 transition-opacity self-end">
                  <button
                    onClick={() => handleRetryMessage(msg.content)}
                    className="p-1.5 rounded-lg hover:bg-indigo-400/20 text-white/70 hover:text-white transition-colors text-xs"
                    title={t('resend')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          ))}

          {/* Typing Indicator */}
          {isTyping && messages.filter(m => m.role === 'assistant' && m.content.trim() !== '').length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 items-start"
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
      </div>

      {/* Input Area - flex-shrink-0 to keep it fixed at bottom */}
      <div className="flex-shrink-0 w-full px-4 pt-4 pb-4 md:pb-6 border-t border-gray-200/50 dark:border-gray-700/50">
        <GlowingInput
          value={inputMessage}
          onChange={setInputMessage}
          onSubmit={handleSubmit}
          onStop={onStopGeneration}
          placeholder={t('describeTask')}
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
