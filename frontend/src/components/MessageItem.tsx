import { memo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Bot, User, Copy, Check, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ArtifactPreviewCard, { DetectedArtifact } from '@/components/ArtifactPreviewCard'
import type { Message } from '@/types'
import { logger } from '@/utils/logger'

interface MessageItemProps {
  msg: Message
  index: number
  conversationMode: 'simple' | 'complex'
  isTyping: boolean
  copiedMessageId: string | null
  onCopyMessage: (content: string, messageId: string) => Promise<void>
  onRegenerate: () => void
  onSelectExpert?: (expertId: string) => void
  onSelectArtifactSession?: (expertId: string) => void
  onArtifactPreviewClick: (artifact: DetectedArtifact, index: number, allArtifacts: DetectedArtifact[]) => void
  detectArtifactsFromMessage: (content: string) => DetectedArtifact[]
}

function MessageItemComponent({ 
  msg, 
  index, 
  conversationMode, 
  isTyping, 
  copiedMessageId, 
  onCopyMessage, 
  onRegenerate, 
  onSelectExpert, 
  onSelectArtifactSession, 
  onArtifactPreviewClick, 
  detectArtifactsFromMessage 
}: MessageItemProps) {
  const isSystemMessage = msg.role === 'system'

  /* 复杂模式：只显示system消息（专家执行状态），不显示user和assistant消息 */
  if (conversationMode !== 'simple' && !isSystemMessage) {
    return null
  }

  if (isSystemMessage) {
    const artifactLinkMatch = msg.content.match(/\[查看交付物\]\(#(\w+)\)/)
    if (artifactLinkMatch) {
      const expertId = artifactLinkMatch[1]
      const cleanContent = msg.content.replace(/\[查看交付物\]\(#\w+\)/, '')
      return (
        <motion.div
          key={msg.id || index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center w-full"
        >
          <Card className="w-full max-w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30">
            <CardContent className="px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-4">
                <span className="flex-1">{cleanContent}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectExpert?.(expertId)
                    onSelectArtifactSession?.(expertId)
                    setTimeout(() => {
                      document.getElementById(`artifact-${expertId}`)?.scrollIntoView({ behavior: 'smooth' })
                    }, 100)
                  }}
                  className="text-[11px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors flex items-center gap-1.5 flex-shrink-0 ml-4"
                >
                  查看交付物
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )
    }
    return (
      <motion.div
        key={msg.id || index}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center w-full"
      >
        <Card className="w-full max-w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30">
          <CardContent className="px-4 py-3 text-left">
            <div className="prose prose-xs dark:prose-invert max-w-none prose-p:my-1.5 prose-p:leading-5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div
      key={msg.id || index}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex gap-4',
        msg.role === 'user' ? 'flex-col items-end' : 'flex-col items-start'
      )}
    >
      <div className={cn('flex gap-4 w-full group', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
        {/* Avatar */}
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          msg.role === 'user' ? 'bg-indigo-600' : 'bg-gradient-to-br from-indigo-500 to-purple-500'
        )}>
          {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
        </div>

        {/* Message Container - 包含气泡和按钮 */}
        <div className={cn('flex flex-col min-w-0 flex-1 max-w-full', msg.role === 'user' ? 'items-end' : 'items-start')}>
          {/* Message Bubble - 自适应宽度，最大260px */}
          {!(msg.role === 'assistant' && msg.content === undefined && !isTyping) && (
            <Card className={cn(
              'rounded-2xl p-3 shadow-sm',
              msg.role === 'user'
                ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white max-w-[260px]'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 max-w-[260px]'
            )}>
              {/* Content Rendering - 正常换行，不强制横向滚动 */}
              <CardContent className="text-sm text-left p-0 w-full">
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap break-words leading-6">{msg.content}</div>
                ) : conversationMode !== 'simple' ? (
                  /* 复杂模式：只显示system消息（专家执行状态） */
                  <div className="prose prose-xs dark:prose-invert max-w-full prose-p:my-1.5 prose-p:leading-5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-p:first:mt-0 prose-p:last:mb-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (() => {
                  const artifacts = detectArtifactsFromMessage(msg.content)

                  /* 简单模式：显示文本内容 + artifact 预览卡片 */
                  return (
                    <div className="space-y-2">
                      <div className="prose prose-sm dark:prose-invert max-w-full prose-p:my-2 prose-p:leading-6 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                      {artifacts.length > 0 && (
                        <div className="space-y-2">
                          {artifacts.map((art, i) => (
                            <ArtifactPreviewCard key={i} artifact={art} index={i} allArtifacts={artifacts} onClick={onArtifactPreviewClick} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons - 气泡下方，参考ChatGPT/DeepSeek */}
          <div className={cn(
            'flex gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity',
            msg.role === 'user' ? 'justify-end' : 'justify-start'
          )}>
            <button
              onClick={() => onCopyMessage(msg.content, msg.id || String(index))}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
              title="复制"
            >
              {copiedMessageId === (msg.id || String(index)) ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {msg.role === 'assistant' && (
              <button onClick={onRegenerate} className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all" title="重新生成">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const MessageItem = memo(MessageItemComponent)
export default MessageItem