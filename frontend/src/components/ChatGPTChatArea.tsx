import { useRef, useEffect, memo } from 'react'
import { Bot, User, MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isTyping?: boolean
}

interface ChatGPTChatAreaProps {
  messages: Message[]
  isTyping: boolean
}

function ChatGPTChatArea({ messages, isTyping }: ChatGPTChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    try {
      if (scrollRef.current && scrollRef.current.scrollHeight) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    } catch (error) {
      console.error('Error scrolling chat area:', error)
    }
  }, [messages, isTyping])

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {messages.length === 0 && !isTyping ? (
        /* 空状态占位图 */
        <div className="flex flex-col items-center justify-center h-full min-h-[50vh] space-y-6 opacity-0 animate-in fade-in duration-500 fill-mode-forwards delay-150">
          <div className="relative group cursor-default">
            {/* 装饰性背景 */}
            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl group-hover:bg-indigo-500/30 transition-all duration-500" />
            
            {/* 图标容器 */}
            <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-white/80 to-white/40 dark:from-gray-800/80 dark:to-gray-800/40 backdrop-blur-xl border border-white/50 dark:border-gray-700/50 shadow-xl flex items-center justify-center transform transition-transform duration-500 hover:scale-105 hover:rotate-3">
              <MessageSquarePlus className="w-10 h-10 text-indigo-500 dark:text-indigo-400 opacity-80" strokeWidth={1.5} />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
              Start a new conversation
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[260px] mx-auto leading-relaxed">
              Type your message below to begin chatting with the AI assistant.
            </p>
          </div>
        </div>
      ) : (
        /* 消息列表 */
        <div className="space-y-6" ref={scrollRef}>
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(to bottom right, #6366F1, #8B5CF6)' }}>
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}

              <div className={`flex-1 max-w-2xl ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                <div
                  className={cn(
                    'px-5 py-4 rounded-2xl transition-colors duration-300 w-fit',
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-vibe-accent to-purple-600 text-white'
                      : 'bg-card/80 backdrop-blur-sm text-foreground shadow-sm border border-border/40'
                  )}
                >
                  {message.role === 'assistant' && !message.content ? (
                    <div className="flex space-x-1 h-5 items-center">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  )}
                  {message.isTyping && message.content && (
                    <span className="inline-block w-1 h-4 ml-1 bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
                  )}
                </div>
              </div>

              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0 transition-colors duration-300">
                  <User className="w-5 h-5 text-gray-600 dark:text-gray-400 transition-colors duration-300" />
                </div>
              )}
            </div>
          ))}

          {/* 正在输入提示 - 仅当最后一条消息是用户发送时显示，或者消息列表为空（防止闪烁）时 */}
          {isTyping && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(to bottom right, #6366F1, #8B5CF6)' }}>
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-card/80 backdrop-blur-sm px-5 py-4 rounded-2xl shadow-sm border border-border/40 transition-colors duration-300">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse opacity-30" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse opacity-60" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(ChatGPTChatArea)
