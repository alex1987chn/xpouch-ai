import { memo } from 'react'
import DOMPurify from 'dompurify'

interface MessageBubbleProps {
  content: string
  role: 'user' | 'assistant'
}

function MessageBubble({ content, role }: MessageBubbleProps) {
  const bubbleClasses =
    role === 'user'
      ? 'bg-gradient-to-r from-cashmere-primary to-cashmere-hover text-cashmere-text shadow-[0_10px_30px_rgba(74,55,40,0.05)] dark:from-ai-primary-dark dark:to-ai-primary-light dark:text-ai-text-dark'
      : 'bg-white/60 border border-white/50 text-cashmere-text shadow-[0_10px_30px_rgba(74,55,40,0.05)] backdrop-blur-md dark:bg-ai-card-dark dark:border-ai-card-dark dark:text-ai-text-dark'

  // 如果内容为空且是助手，显示跳动的点
  const isEmptyAssistant = role === 'assistant' && !content;

  return (
    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${bubbleClasses}`}>
      {isEmptyAssistant ? (
         <div className="flex space-x-1 h-5 items-center">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
        </div>
      ) : (
        <div
          className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
        />
      )}
    </div>
  )
}

export default memo(MessageBubble)
