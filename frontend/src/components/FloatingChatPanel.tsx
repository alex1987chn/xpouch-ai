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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'

type ConversationMode = 'simple' | 'complex'

// Artifact类型定义
type DetectedArtifact = {
  type: 'code' | 'html'
  content: string
  language?: string
}

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

// 生成artifact名称 - 按类型分别计数
function getArtifactName(type: string, index: number, allArtifacts: DetectedArtifact[]): string {
  const typeMap: Record<string, string> = {
    'code': '代码',
    'html': '网页',
    'markdown': '文本'
  }

  // 计算该类型在所有artifacts中的索引
  const typeIndex = allArtifacts
    .slice(0, index + 1)
    .filter(a => a.type === type)
    .length

  return `${typeMap[type] || type}${typeIndex}`
}

// 获取预览内容（截取）
function getPreviewContent(content: string, maxLength = 80): string {
  // 移除代码块标记，只保留内容
  const cleanContent = content.replace(/```(\w+)?\n?/g, '').replace(/\n```$/g, '')
  if (cleanContent.length <= maxLength) {
    return cleanContent
  }
  return cleanContent.substring(0, maxLength) + '...'
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
      console.warn('[FloatingChatPanel] onConversationModeChange 未提供')
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

  // Artifact预览卡片组件
  function ArtifactPreviewCard({ artifact, index, allArtifacts }: { artifact: DetectedArtifact, index: number, allArtifacts: DetectedArtifact[] }) {
    const typeName = getArtifactName(artifact.type, index, allArtifacts)
    const previewContent = getPreviewContent(artifact.content)

    const typeConfig = {
      code: {
        icon: <Code className="w-4 h-4" />,
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        textColor: 'text-blue-600 dark:text-blue-400',
        borderColor: 'border-blue-200 dark:border-blue-800/30'
      },
      html: {
        icon: <Globe className="w-4 h-4" />,
        bgColor: 'bg-orange-100 dark:bg-orange-900/30',
        textColor: 'text-orange-600 dark:text-orange-400',
        borderColor: 'border-orange-200 dark:border-orange-800/30'
      },
      markdown: {
        icon: <FileText className="w-4 h-4" />,
        bgColor: 'bg-purple-100 dark:bg-purple-900/30',
        textColor: 'text-purple-600 dark:text-purple-400',
        borderColor: 'border-purple-200 dark:border-purple-800/30'
      }
    }

    const config = typeConfig[artifact.type]

    return (
      <button
        onClick={() => handleArtifactPreviewClick(artifact, index, allArtifacts)}
        className={cn(
          'w-full group relative rounded-lg border p-3 text-left transition-all',
          'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
          config.bgColor,
          config.borderColor
        )}
      >
        <div className="flex items-start gap-3">
          {/* 图标 */}
          <div className={cn(
            'flex-shrink-0 mt-0.5 p-1.5 rounded-md',
            config.textColor
          )}>
            {config.icon}
          </div>

          {/* 内容 */}
          <div className="flex-1 min-w-0">
            {/* 名称 */}
            <div className={cn(
              'text-xs font-medium mb-1',
              config.textColor
            )}>
              {typeName}
            </div>

            {/* 预览内容 */}
            <div className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
              {previewContent}
            </div>
          </div>

          {/* 右侧指示箭头 */}
          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </button>
    )
  }

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
                  {messages.map((msg, index) => {
                    console.log('[FloatingChatPanel] 渲染消息:', { index, role: msg.role, contentLength: msg.content?.length, contentPreview: msg.content?.substring(0, 50) })
                    const isSystemMessage = msg.role === 'system'

                    /* 复杂模式：只显示system消息（专家执行状态），不显示user和assistant消息 */
                    if (conversationMode !== 'simple' && !isSystemMessage) {
                      return null
                    }

                    if (isSystemMessage) {
                      return (
                        <motion.div
                          key={msg.id || index}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col items-center w-full"
                        >
                          <Card className="w-full max-w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30">
                            <CardContent className="px-4 py-3 text-left">
                              {(() => {
                                const artifactLinkMatch = msg.content.match(/\[查看交付物\]\(#(\w+)\)/)
                                if (artifactLinkMatch) {
                                  const expertId = artifactLinkMatch[1]
                                  const cleanContent = msg.content.replace(/\[查看交付物\]\(#\w+\)/, '')
                                  return (
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex-1">{cleanContent}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          selectExpert?.(expertId)
                                          selectArtifactSession?.(expertId)
                                          setTimeout(() => {
                                            document.getElementById(`artifact-${expertId}`)?.scrollIntoView({ behavior: 'smooth' })
                                          }, 100)
                                        }}
                                        className="text-[11px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors flex items-center gap-1.5 flex-shrink-0 ml-4"
                                      >
                                        查看交付物
                                      </button>
                                    </div>
                                  )
                                }
                                return (
                                  <div className="prose prose-xs dark:prose-invert max-w-none prose-p:my-1.5 prose-p:leading-5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                  </div>
                                )
                              })()}
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
                                                <ArtifactPreviewCard key={i} artifact={art} index={i} allArtifacts={artifacts} />
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
                                onClick={() => handleCopyMessage(msg.content, msg.id || String(index))}
                                className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                                title="复制"
                              >
                                {copiedMessageId === (msg.id || String(index)) ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              {msg.role === 'assistant' && (
                                <button onClick={handleRegenerate} className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all" title="重新生成">
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}

                {/* Typing Indicator - 复杂模式显示文案提示，简单模式显示三个圆圈 */}
                {isTyping && !messages.some(m => m.role === 'assistant' && m.content && m.content.length > 10) && runningExpert && runningExpertConfig && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4">
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {runningExpertConfig.name}正在执行任务中，请稍候...
                      </div>
                    </div>
                  </motion.div>
                )}
                {/* 简单模式的loading指示器 */}
                {isTyping && !runningExpert && !messages.some(m => m.role === 'assistant' && m.content && m.content.length > 10) && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
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
}
