import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Bot, User, Minimize2, Maximize2, Copy, Check, RotateCcw, MoreVertical, Sparkles, Code, Globe, FileText, ArrowRight } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useCanvasStore } from '@/store/canvasStore'
import type { Message, Artifact } from '@/store/chatStore'
import GlowingInput from './GlowingInput'
import { useTranslation } from '@/i18n'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getExpertConfig } from '@/constants/systemAgents'

type ConversationMode = 'simple' | 'complex'

// Artifact类型定义
type DetectedArtifact = {
  type: 'code' | 'html' | 'markdown'
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

  // 智能检测复杂Markdown（长度>500字 + 包含复杂结构）
  // 规则：包含多级标题(##+) 或 无序列表(-*+) 或 有序列表(\d+.)
  const hasComplexStructure = /#{2,}|^[\s]*[-*+] |^\d+\./m.test(content)
  const hasCodeBlock = /```[\s\S]*?```/.test(content)
  const textLength = content.replace(/```[\s\S]*?```/g, '').trim().length

  // 如果内容较长且包含复杂结构，识别为markdown artifact
  // 同时排除已经检测到代码块或HTML的情况，避免重复
  if (textLength > 500 && hasComplexStructure && !hasCodeBlock && artifacts.length === 0) {
    artifacts.push({
      type: 'markdown',
      content: content
    })
  }

  return artifacts
}

// 生成artifact名称
function getArtifactName(type: string, index: number, total: number): string {
  const typeMap: Record<string, string> = {
    'code': '代码',
    'html': '网页',
    'markdown': '文档'
  }
  // 根据类型和总数量生成名称
  if (total === 1) {
    return `${typeMap[type]}1`
  }
  return `${typeMap[type]}${index + 1}`
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
  isChatMinimized?: boolean
  setIsChatMinimized?: (minimized: boolean) => void
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
  isChatMinimized: propIsChatMinimized = false,
  setIsChatMinimized: propSetIsChatMinimized,
  onStopGeneration,
  conversationMode = 'simple',
  onConversationModeChange,
  hideModeSwitch = false
}: FloatingChatPanelProps) {
  const { t } = useTranslation()
  const { selectExpert, selectArtifactSession, expertResults, selectedExpert: canvasSelectedExpert } = useCanvasStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isMinimized, setIsMinimized] = useState(false)

  // 获取当前正在执行的专家（用于loading气泡展示）
  const runningExpert = expertResults.find(exp => exp.status === 'running')
  const runningExpertConfig = runningExpert ? getExpertConfig(runningExpert.expertType) : null

  // Use parent's state if provided, otherwise use local state
  const effectiveIsChatMinimized = propSetIsChatMinimized ? propIsChatMinimized : isMinimized
  const effectiveSetIsChatMinimized = propSetIsChatMinimized || setIsMinimized

  // 处理模式切换
  const handleModeChange = (newMode: ConversationMode) => {
    console.log('[FloatingChatPanel] 切换模式:', conversationMode, '->', newMode)
    if (onConversationModeChange) {
      onConversationModeChange(newMode)
    } else {
      console.warn('[FloatingChatPanel] onConversationModeChange 未提供')
    }
  }

  // 根据对话模式更新 agentId
  useEffect(() => {
    console.log('[FloatingChatPanel] 当前对话模式:', conversationMode)
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
  const handleArtifactPreviewClick = useCallback((artifact: DetectedArtifact, index: number, total: number) => {
    // 在简单模式下，需要将artifact传递到右侧区域显示
    console.log('[FloatingChatPanel] 点击artifact预览:', { type: artifact.type, index, total })

    // 检测并添加到canvasStore
    const expertType = 'simple'
    const artifactName = getArtifactName(artifact.type, index, total)

    // 创建一个新的artifact对象
    const newArtifact: Artifact = {
      id: `artifact-${Date.now()}-${index}`,
      type: artifact.type as any,
      content: artifact.content,
      title: artifactName,
      createdAt: new Date().toISOString()
    }

    // 添加到canvasStore的artifactSessions中
    // 注意：这里简化处理，实际应该根据conversationMode判断
    if (selectArtifactSession) {
      selectArtifactSession(expertType)
    }
  }, [selectArtifactSession])

  // Artifact预览卡片组件
  function ArtifactPreviewCard({ artifact, index, total }: { artifact: DetectedArtifact, index: number, total: number }) {
    const typeName = getArtifactName(artifact.type, index, total)
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
        onClick={() => handleArtifactPreviewClick(artifact, index, total)}
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
                {messages
                  .filter(msg => msg.content.trim() !== '')
                  .map((msg, index) => {
                    const isSystemMessage = msg.role === 'system'

                    return (
                      <motion.div
                        key={msg.id || index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'flex gap-3',
                          msg.role === 'user' ? 'flex-col items-end' : 'flex-col items-start',
                          isSystemMessage && 'flex-col items-center'
                        )}
                      >
                        {isSystemMessage ? (
                          <div className="w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 rounded-xl px-4 py-3 text-left">
                            <div className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
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
                                  <div className="prose prose-xs dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        ) : (
                          <div className={cn('flex gap-3 w-full group', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                            {/* Avatar */}
                            <div className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                              msg.role === 'user' ? 'bg-indigo-600' : 'bg-gradient-to-br from-indigo-500 to-purple-500'
                            )}>
                              {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                            </div>

                            {/* Message Bubble */}
                            <div className={cn(
                              'relative max-w-[80%] rounded-2xl p-4 shadow-sm',
                              msg.role === 'user' 
                                ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white' 
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                            )}>
                              {/* Action Buttons Panel */}
                              <div className={cn(
                                'absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
                                msg.role === 'user' ? 'flex-row-reverse -top-8 right-0' : 'flex-row'
                              )}>
                                <button
                                  onClick={() => handleCopyMessage(msg.content, msg.id || String(index))}
                                  className="p-1.5 rounded-lg bg-gray-200/50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-300 transition-colors"
                                >
                                  {copiedMessageId === (msg.id || String(index)) ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                {msg.role === 'assistant' && (
                                  <button onClick={handleRegenerate} className="p-1.5 rounded-lg bg-gray-200/50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-300">
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Content Rendering */}
                              <div className="text-sm text-left">
                                {msg.role === 'user' ? (
                                  <div className="whitespace-pre-wrap">{msg.content}</div>
                                ) : (
                                  <>
                                    {conversationMode === 'simple' ? (() => {
                                      const artifacts = detectArtifactsFromMessage(msg.content)
                                      const hasMarkdownArtifact = artifacts.some(a => a.type === 'markdown')

                                      if (hasMarkdownArtifact) {
                                        // 如果有markdown artifact，只显示预览卡片
                                        return (
                                          <div className="space-y-2">
                                            {artifacts.map((art, i) => (
                                              <ArtifactPreviewCard key={i} artifact={art} index={i} total={artifacts.length} />
                                            ))}
                                          </div>
                                        )
                                      }

                                      // 如果没有markdown artifact，显示文本 + code/html artifact
                                      const textOnly = msg.content.replace(/```[\s\S]*?```/g, '').trim()
                                      return (
                                        <div className="space-y-3">
                                          {textOnly && <ReactMarkdown remarkPlugins={[remarkGfm]}>{textOnly}</ReactMarkdown>}
                                          {artifacts.map((art, i) => (
                                            <ArtifactPreviewCard key={i} artifact={art} index={i} total={artifacts.length} />
                                          ))}
                                        </div>
                                      )
                                    })() : (
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )
                  })}

                {/* Typing Indicator */}
                {isTyping && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4">
                      {runningExpert ? (
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                          <span className="text-sm">{runningExpertConfig?.name} 正在执行...</span>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      )}
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
                conversationMode={conversationMode}
                onConversationModeChange={onConversationModeChange}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
