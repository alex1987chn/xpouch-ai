import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Bot, User, Copy, Check, RotateCcw, Sparkles, Code, Globe, FileText, ArrowRight } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useCanvasStore } from '@/store/canvasStore'
import { useArtifacts } from '@/providers/ArtifactProvider'
import type { Message, Artifact } from '@/types'
import GlowingInput from './GlowingInput'
import { useTranslation } from '@/i18n'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getExpertConfig } from '@/constants/systemAgents'
import ArtifactPreviewCard, { DetectedArtifact, getArtifactName, getPreviewContent } from '@/components/ArtifactPreviewCard'
import MessageItem from '@/components/MessageItem'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { memo } from 'react'
import { logger } from '@/utils/logger'

type ConversationMode = 'simple' | 'complex'


// 从消息内容中检测artifacts
function detectArtifactsFromMessage(content: string): DetectedArtifact[] {
  const artifacts: DetectedArtifact[] = []

  // 检测代码块 ```language code ```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g
  let match
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text'
    const codeContent = match[2]
    artifacts.push({
      type: 'code',
      content: codeContent,
      language
    })
  }

  // 检测HTML块（可能用特殊标记）
  if (content.includes('```html') || content.includes('<!DOCTYPE html>') || /<html[\s>]/i.test(content)) {
    // 如果上面已经检测到html代码块，跳过
    const hasHtmlCodeBlock = artifacts.some(a => a.language === 'html')
    if (!hasHtmlCodeBlock) {
      const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/i) || content.match(/<html[\s\S]*?<\/html>/is)
      if (htmlMatch) {
        artifacts.push({
          type: 'html',
          content: htmlMatch[1] || htmlMatch[0],
          language: 'html'
        })
      }
    }
  }

  return artifacts
}


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
  onStopGeneration?: () => void
  conversationMode?: ConversationMode
  onConversationModeChange?: (mode: ConversationMode) => void
  hideModeSwitch?: boolean
}

export default memo(function FloatingChatPanel({
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
  onStopGeneration,
  conversationMode = 'simple',
  onConversationModeChange,
  hideModeSwitch = false
}: FloatingChatPanelProps) {
  const { t } = useTranslation()
  const { selectExpert, selectArtifactSession, expertResults, selectedExpert: canvasSelectedExpert, addArtifact: storeAddArtifact, getArtifactSession, switchArtifactIndex } = useCanvasStore()
  const { addArtifact: providerAddArtifact } = useArtifacts()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 获取当前正在执行的专家（用于loading气泡展示）
  const runningExpert = expertResults.find(exp => exp.status === 'running')
  const runningExpertConfig = runningExpert ? getExpertConfig(runningExpert.expertType) : null

  // 处理模式切换
  const handleModeChange = (newMode: ConversationMode) => {
    if (onConversationModeChange) {
      onConversationModeChange(newMode)
    } else {
      logger.warn('[FloatingChatPanel] onConversationModeChange 未提供')
    }
  }

  // 根据对话模式更新 agentId
  useEffect(() => {
    // 根据对话模式更新 agentId
  }, [conversationMode])
  
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
      logger.error('Failed to copy:', err)
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

  // 处理点击artifact预览卡片
  const handleArtifactPreviewClick = useCallback((artifact: DetectedArtifact, index: number, allArtifacts: DetectedArtifact[]) => {
    // 在简单模式下，需要将artifact传递到右侧区域显示

    const expertType = 'simple'
    const artifactName = getArtifactName(artifact.type, index, allArtifacts)

    // 检查该专家会话是否已存在（使用artifactSessions而不是expertResults）
    const existingSession = getArtifactSession(expertType)

    if (existingSession) {
      // 查找是否已存在相同内容和类型的artifact
      const existingArtifactIndex = existingSession.artifacts.findIndex(art =>
        art.type === artifact.type &&
        art.content === artifact.content
      )

      if (existingArtifactIndex === -1) {
        // 添加新的artifact到现有会话
        const newArtifact: Artifact = {
          id: `artifact-${Date.now()}-${index}`,
          type: artifact.type,
          content: artifact.content,
          title: artifactName,
          timestamp: new Date().toISOString()
        }
        storeAddArtifact(expertType, newArtifact)
        // storeAddArtifact会自动将currentIndex设置为新artifact的索引
      } else {
        // artifact已存在，切换到该索引
        switchArtifactIndex(expertType, existingArtifactIndex)
      }

      // 选中该会话
      selectArtifactSession(expertType)
      selectExpert(expertType)
    } else {
      // 会话不存在，创建新会话并添加artifact
      const newArtifact: Artifact = {
        id: `artifact-${Date.now()}-${index}`,
        type: artifact.type,
        content: artifact.content,
        title: artifactName,
        timestamp: new Date().toISOString()
      }

      // 添加到store（这会自动创建新会话）
      storeAddArtifact(expertType, newArtifact)

      // 选中该专家会话
      selectArtifactSession(expertType)
      selectExpert(expertType)
    }
  }, [selectExpert, selectArtifactSession, storeAddArtifact, switchArtifactIndex, providerAddArtifact, getArtifactSession])


  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className={cn(
            'flex flex-col h-full min-h-0 overflow-hidden'
          )}
        >
            {/* Header - Fixed at top, flex-shrink-0, max-width约束 */}
            <div className="flex-shrink-0 w-full max-w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 px-4 py-3">
              <div className="flex items-center gap-3 w-full min-w-0">
                {/* 左侧：智能体信息 */}
                <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {displayName}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {displayDescription}
                    </p>
                  </div>
                </div>

                {/* 右侧：移动端切换器 (md:hidden) */}
                <div className="flex items-center justify-end flex-shrink-0">
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

            {/* Messages - flex-1 + overflow-y-auto for scrolling, 防止长文本撑开 */}
            <ScrollArea className="flex-1 w-full overflow-hidden">
              <div className="px-4 py-4 space-y-5 w-full break-words overflow-x-hidden">
                {messages.map((msg, index) => (
                  <MessageItem
                    key={msg.id || index}
                    msg={msg}
                    index={index}
                    conversationMode={conversationMode}
                    isTyping={isTyping}
                    copiedMessageId={copiedMessageId}
                    onCopyMessage={handleCopyMessage}
                    onRegenerate={handleRegenerate}
                    onSelectExpert={selectExpert}
                    onSelectArtifactSession={selectArtifactSession}
                    onArtifactPreviewClick={handleArtifactPreviewClick}
                    detectArtifactsFromMessage={detectArtifactsFromMessage}
                  />
                ))}


                {/* Typing Indicator - 复杂模式显示详细任务进度，简单模式显示三个圆圈 */}
                {isTyping && !messages.some(m => m.role === 'assistant' && m.content && m.content.length > 10) && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 max-w-md">
                      <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                        {runningExpert && runningExpertConfig ? (
                          // 复杂模式：有正在运行的专家时，显示详细任务进度
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                              <span className="font-medium text-gray-800 dark:text-gray-200">{runningExpertConfig.name}</span>
                            </div>
                            {runningExpert.description ? (
                              <div className="text-gray-600 dark:text-gray-400">
                                正在{runningExpert.description}...
                              </div>
                            ) : (
                              <div className="text-gray-600 dark:text-gray-400">
                                正在执行任务中，请稍候...
                              </div>
                            )}
                          </>
                        ) : conversationMode === 'complex' ? (
                          // 复杂模式：没有正在运行的专家时，显示通用提示
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                            <span className="text-gray-700 dark:text-gray-300">正在分析需求并规划任务...</span>
                          </div>
                        ) : (
                          // 简单模式：显示三个圆圈
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area - flex-shrink-0 to keep it fixed at bottom, 宽度约束 */}
            <div className="flex-shrink-0 w-full max-w-full px-4 pt-4 pb-4 md:pb-6 border-t border-gray-200/50 dark:border-gray-700/50">
              <GlowingInput
                value={inputMessage}
                onChange={setInputMessage}
                onSubmit={handleSubmit}
                onStop={onStopGeneration}
                placeholder={t('describeTask')}
                disabled={isTyping}
                isTyping={isTyping}
                conversationMode={conversationMode}
                onConversationModeChange={onConversationModeChange}
              />
            </div>
          </motion.div>
      </AnimatePresence>
    </>
  )
})