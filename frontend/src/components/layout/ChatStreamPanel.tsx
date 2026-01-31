import { useRef, useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Terminal, Paperclip, Globe, Copy, Check, RefreshCw, Square, Brain, ChevronUp, ChevronDown, X, Eye } from 'lucide-react'
import type { Message } from '@/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useTranslation } from '@/i18n'
import { useCanvasStore } from '@/store/canvasStore'

/**
 * 提取消息中的代码块
 * 返回代码块数组，每个包含语言和代码内容
 */
function extractCodeBlocks(content: string): Array<{language: string, code: string}> {
  const codeBlocks: Array<{language: string, code: string}> = []
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text'
    const code = match[2].trim()
    if (code) {
      codeBlocks.push({ language, code })
    }
  }
  
  return codeBlocks
}

/**
 * 判断内容类型
 * 根据代码块语言或内容特征返回 artifact 类型
 */
function detectContentType(
  codeBlocks: Array<{language: string, code: string}>, 
  fullContent: string
): {type: 'code' | 'markdown' | 'html', content: string} | null {
  // 优先处理代码块
  if (codeBlocks.length > 0) {
    // 如果只有一个代码块，直接用它
    if (codeBlocks.length === 1) {
      const block = codeBlocks[0]
      const lang = block.language.toLowerCase()
      
      if (lang === 'html' || lang === 'htm') {
        return { type: 'html', content: block.code }
      } else if (['markdown', 'md'].includes(lang)) {
        return { type: 'markdown', content: block.code }
      } else if (['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'c', 'cpp', 'json', 'yaml', 'sql', 'bash', 'shell'].includes(lang)) {
        return { type: 'code', content: block.code }
      } else {
        return { type: 'code', content: block.code }
      }
    }
    
    // 如果有多个代码块，合并它们
    const allCode = codeBlocks.map(b => `// ${b.language}\n${b.code}`).join('\n\n')
    return { type: 'code', content: allCode }
  }
  
  // 没有代码块时，检查是否是 Markdown 格式内容
  if (fullContent.length > 50) {
    // 检测 Markdown 特征：标题、列表、粗体、斜体、链接等
    const markdownPatterns = [
      /^#{1,6}\s+/m,           // 标题 # ## ###
      /^\s*[-*+]\s+/m,        // 列表 - * +
      /^\s*\d+\.\s+/m,        // 有序列表 1. 2.
      /\*\*[^*]+\*\*/,        // 粗体 **text**
      /\*[^*]+\*/,            // 斜体 *text*
      /\[[^\]]+\]\([^)]+\)/,  // 链接 [text](url)
      /^\s*```/m,             // 代码块 ```
      /^\s*>\s+/m,            // 引用 >
      /\|[^|]+\|/,            // 表格 |
    ]
    
    const markdownScore = markdownPatterns.reduce((score, pattern) => {
      return score + (pattern.test(fullContent) ? 1 : 0)
    }, 0)
    
    // 如果匹配至少 2 个 Markdown 特征，认为是 Markdown 内容
    if (markdownScore >= 2) {
      return { type: 'markdown', content: fullContent }
    }
  }
  
  return null
}

/**
 * =============================
 * 聊天流面板 (ChatStreamPanel)
 * =============================
 *
 * [架构层级] Layer 5 - 聊天界面组件
 *
 * [设计风格] Industrial Terminal (工业终端)
 * - 点阵背景：dot-grid
 * - 终端风格：等宽字体、行号、命令提示符
 * - 机械控制台：重型边框、阴影、物理开关
 *
 * [核心功能]
 * 1. 消息流渲染：用户消息 + AI 消息 + 路由指示器
 * 2. Markdown 支持：GFM 表格、代码高亮 (rehype-highlight)
 * 3. 输入控制台：Heavy Input Console（机械风格）
 * 4. 模式切换：SIMPLE/COMPLEX 物理开关
 * 5. 工具按钮：附件、网络搜索
 *
 * [消息样式]
 * - 用户消息：黑色代码块风格 (bg-primary + 终端符 `>_`)
 * - AI 消息：白色卡片 + 左侧黄色条边框 (border-l-[var(--accent)])
 * - 路由指示器：复杂模式下显示专家路由 (ROUTING → EXPERT_AGENT)
 *
 * [输入控制台]
 * - 行号区域：01/02/03 固定行号
 * - 文本区域：等宽字体，placeholder `// Init construction sequence...`
 * - 工具栏：模式切换 + 附件 + 网络 + EXECUTE 按钮
 */
interface ChatStreamPanelProps {
  /** 消息列表 */
  messages: Message[]
  /** 是否正在生成回复 */
  isGenerating: boolean
  /** 当前输入值 */
  inputValue: string
  /** 输入框变化回调 */
  onInputChange: (value: string) => void
  /** 发送消息回调 */
  onSend: () => void
  /** 停止生成回调 */
  onStop?: () => void
  /** 当前活跃专家 (用于显示路由指示器) */
  activeExpert?: string | null
  /** 重新生成消息回调 */
  onRegenerate?: (messageId: string) => void
  /** 链接点击回调 */
  onLinkClick?: (href: string) => void
}

/**
 * 左侧聊天流面板 - Industrial Style
 *
 * 包含：
 * 1. 消息列表 (Terminal 风格)
 * 2. 底部输入控制台 (Heavy Input Console)
 */
export default function ChatStreamPanel({
  messages,
  isGenerating,
  inputValue,
  onInputChange,
  onSend,
  onStop,
  activeExpert,
  onRegenerate,
  onLinkClick,
}: ChatStreamPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isGenerating])

  // 处理发送
  const handleSend = () => {
    if (!inputValue.trim() || isGenerating) return
    onSend()
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* 消息列表区域 */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 dot-grid scrollbar-hide"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg, index) => (
            <MessageItem 
              key={msg.id || index} 
              message={msg} 
              isLast={index === messages.length - 1}
              activeExpert={activeExpert}
              onRegenerate={onRegenerate}
              onLinkClick={onLinkClick}
            />
          ))
        )}
        
        {/* 生成中指示器 */}
        {isGenerating && (
          <GeneratingIndicator />
        )}
      </div>

      {/* 底部输入控制台 */}
      <HeavyInputConsole
        value={inputValue}
        onChange={onInputChange}
        onSend={handleSend}
        onStop={onStop}
        onKeyDown={handleKeyDown}
        disabled={isGenerating}
      />
    </>
  )
}

// ============ 子组件 ============

import type { ThinkingStep } from '@/types'

/** 翻译专家名称 */
function translateExpertName(name: string, t: (key: string) => string): string {
  const nameMap: Record<string, string> = {
    'Task Planning': t('planningExpert') || '规划专家',
    'planner': t('planningExpert') || '规划专家',
    'commander': t('commander') || '指挥官',
    'search': t('searchExpertName') || '搜索专家',
    'coding': t('codingExpert') || '编程专家',
    'research': t('researchExpert') || '研究专家',
    'analyzer': t('analyzerExpertName') || '分析专家',
    'writing': t('writingExpert') || '写作专家',
  }
  return nameMap[name] || name
}

/** Thinking 区域 - 可展开的思考过程 */
function ThinkingSection({ thinking }: { thinking: ThinkingStep[] }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { t } = useTranslation()
  
  const completedSteps = thinking.filter(s => s.status === 'completed').length
  
  return (
    <div className="mb-4 border border-border bg-panel">
      {/* 头部 - 点击展开/收起 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-primary/80 hover:text-primary transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-[var(--accent-hover)]" />
          <span className="font-bold">{t('thinking')}</span>
          <span className="text-[10px] text-primary/60">
            ({completedSteps}/{thinking.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {thinking.some(s => s.status === 'running') && (
            <div className="w-1.5 h-1.5 bg-[var(--accent-hover)] rounded-full animate-pulse" />
          )}
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>
      
      {/* 展开内容 */}
      {isExpanded && (
        <div className="border-t border-border px-3 py-2 space-y-2 max-h-60 overflow-y-auto">
          {thinking.map((step, index) => (
            <div key={step.id} className="text-xs font-mono">
              <div className="flex items-center gap-2 text-[10px] text-primary/70 mb-1">
                <span className="text-[var(--accent-hover)] font-bold">[{index + 1}]</span>
                <span className="font-semibold">{translateExpertName(step.expertName, t)}</span>
                {step.status === 'running' && <span className="text-[var(--accent-hover)] animate-pulse">...</span>}
                {step.status === 'completed' && <Check className="w-3 h-3 text-green-600 dark:text-green-400" />}
                {step.status === 'failed' && <X className="w-3 h-3 text-red-600 dark:text-red-400" />}
              </div>
              <div className="pl-4 text-primary/80 whitespace-pre-wrap">
                {step.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 空状态 */
function EmptyState() {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 border-2 border-dashed border-border/60 flex items-center justify-center mb-4 text-primary/60">
        <Terminal className="w-8 h-8" />
      </div>
      <p className="font-mono text-xs uppercase tracking-widest text-primary/70 dark:text-primary/60">
        {t('initConversation')}
      </p>
    </div>
  )
}

/** 单条消息 */
function MessageItem({
  message,
  isLast,
  activeExpert,
  onRegenerate,
  onLinkClick,
}: {
  message: Message
  isLast: boolean
  activeExpert?: string | null
  onRegenerate?: (messageId: string) => void
  onLinkClick?: (href: string) => void
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()
  
  // 检查是否有可预览的代码块
  const codeBlocks = extractCodeBlocks(message.content)
  const hasPreviewContent = codeBlocks.length > 0 || message.content.length > 200
  
  // 处理预览 - 将内容发送到 artifact 区域（替换模式）
  const handlePreview = useCallback(() => {
    const setSimplePreview = useCanvasStore.getState().setSimplePreview
    
    // 检测内容类型（传入完整内容用于 Markdown 识别）
    const detected = detectContentType(codeBlocks, message.content)
    if (detected) {
      setSimplePreview({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: detected.type,
        title: detected.type === 'code' ? '代码预览' : detected.type === 'html' ? 'HTML 预览' : 'Markdown 预览',
        content: detected.content,
        language: detected.type === 'code' ? codeBlocks[0]?.language || 'text' : undefined
      })
    } else if (message.content.length > 200) {
      // 如果内容较长但没有代码块，将整个消息作为 markdown 预览
      setSimplePreview({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'markdown',
        title: '消息预览',
        content: message.content,
      })
    }
  }, [message.content, codeBlocks])
  
  // 处理复制
  const handleCopy = useCallback(async () => {
    const textToCopy = message?.content || ''
    if (!textToCopy) {
      console.warn('[Message Copy] No content to copy')
      return
    }

    console.log('[Message Copy] Copying content, length:', textToCopy.length)

    try {
      // 首选: Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        console.log('[Message Copy] Success via Clipboard API')
        return
      }

      // 降级方案: 使用 textarea 复制
      const textarea = document.createElement('textarea')
      textarea.value = textToCopy
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'
      document.body.appendChild(textarea)
      
      const range = document.createRange()
      range.selectNode(textarea)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      textarea.select()
      textarea.setSelectionRange(0, textToCopy.length)

      try {
        const successful = document.execCommand('copy')
        if (successful) {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
          console.log('[Message Copy] Success via execCommand')
        } else {
          console.error('[Message Copy] execCommand returned false')
        }
      } catch (err) {
        console.error('[Message Copy] Fallback copy failed:', err)
      } finally {
        document.body.removeChild(textarea)
      }
    } catch (err) {
      console.error('[Message Copy] Failed to copy:', err)
    }
  }, [message])
  
  // 处理重试
  const handleRetry = useCallback(() => {
    if (message.id && onRegenerate) {
      onRegenerate(message.id)
    }
  }, [message.id, onRegenerate])
  
  if (isUser) {
    // 用户消息：深色代码块风格
    return (
      <div className="flex flex-col items-end group user-message">
        <div className="flex items-center gap-2 mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <span className="font-mono text-[9px] uppercase text-primary/50 dark:text-primary/40">ID: {String(message.id ?? '').slice(0, 6)} // USER</span>
        </div>
        <div className="bg-primary text-inverted p-5 shadow-hard border-2 border-transparent w-fit max-w-[80%] select-text">
          <div className="flex gap-3">
            <span className="font-mono text-[var(--accent)] font-bold shrink-0">&gt;_</span>
            <p className="font-mono text-sm leading-relaxed whitespace-pre-wrap select-text text-inverted">
              {message.content}
            </p>
          </div>
        </div>
      </div>
    )
}

  // AI 消息：左侧色条容器 + 路由指示器
  return (
    <div className="flex flex-col items-start w-full max-w-3xl select-text ai-message">
      {/* 路由指示器 (仅在复杂模式且不是最后一条时显示) */}
      {activeExpert && !isLast && (
        <RoutingIndicator expertType={activeExpert} />
      )}

      {/* 消息内容 */}
      <div className="bg-card border-2 border-border border-l-[6px] border-l-[var(--accent)] p-6 w-full shadow-sm relative select-text">
        {/* 标签 */}
        <div className="absolute top-0 right-0 bg-[var(--accent)] text-inverted font-mono text-[9px] px-2 py-0.5 font-bold select-none">
          {activeExpert ? `${activeExpert.toUpperCase()}_RESPONSE` : 'FINAL_PLAN'}
        </div>

        {/* Thinking 区域 - 思考过程展开/收起 */}
        {message.metadata?.thinking && message.metadata.thinking.length > 0 && (
          <ThinkingSection thinking={message.metadata.thinking} />
        )}

        {/* Markdown 内容 */}
        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-sm prose-headings:font-bold prose-headings:text-primary prose-p:text-sm prose-p:leading-relaxed prose-p:text-primary prose-strong:text-primary prose-code:text-primary prose-pre:bg-panel prose-pre:border prose-pre:border-border/20 prose-a:text-blue-600 dark:prose-a:text-blue-400 select-text">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              a: ({ node, ...props }) => (
                <a
                  {...props}
                  onClick={(e) => {
                    if (props.href?.startsWith('#')) {
                      e.preventDefault()
                      onLinkClick?.(props.href)
                    }
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                />
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* 底部操作栏 */}
        <div className="mt-4 pt-3 border-t border-border/20 flex justify-between items-center">
          <span className="font-mono text-[10px] text-primary/60 dark:text-primary/50">
            TOKENS: {message.content.length}
          </span>
          <div className="flex gap-2">
            {/* 预览按钮 - 当内容包含代码块或较长时显示 */}
            {hasPreviewContent && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handlePreview()
                }}
                className="relative z-10 flex items-center gap-1 text-[10px] font-bold hover:bg-primary hover:text-inverted px-2 py-1 transition-colors cursor-pointer"
                title={t('preview')}
              >
                <Eye className="w-3 h-3" />
                {t('preview')}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCopy()
              }}
              className="relative z-10 flex items-center gap-1 text-[10px] font-bold hover:bg-primary hover:text-inverted px-2 py-1 transition-colors cursor-pointer"
              title={t('copy')}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  {t('copied')}
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  {t('copy')}
                </>
              )}
            </button>
            {onRegenerate && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleRetry()
                }}
                className="relative z-10 flex items-center gap-1 text-[10px] font-bold hover:bg-primary hover:text-inverted px-2 py-1 transition-colors cursor-pointer"
                title={t('regenerate')}
              >
                <RefreshCw className="w-3 h-3" />
                {t('retry')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 路由指示器 */
function RoutingIndicator({ expertType }: { expertType: string }) {
  return (
    <div className="flex items-center gap-2 mb-0 ml-4 pl-4 border-l-2 border-dashed border-border/40 h-6">
      <span className="font-mono text-[9px] bg-panel dark:bg-panel/80 px-1.5 py-0.5 text-primary/70 dark:text-primary/60">ROUTING</span>
      <span className="text-primary/50 dark:text-primary/40">→</span>
      <span className="font-mono text-[9px] font-bold border border-border px-1.5 py-0.5 bg-card text-primary dark:text-primary/95">
        {expertType.toUpperCase()}_AGENT
      </span>
    </div>
  )
}

/** 生成中指示器 */
function GeneratingIndicator() {
  return (
    <div className="flex flex-col items-start w-full max-w-3xl ml-4 pl-4 border-l-2 border-dashed border-border/40 pb-4">
      <div className="bg-card dark:bg-card/95 border border-border border-dashed p-3 w-fit flex items-center gap-2 text-xs font-mono text-primary dark:text-primary/95 animate-pulse">
        <span className="w-3 h-3 border-2 border-border dark:border-border/80 border-t-transparent rounded-full animate-spin" />
        <span>Processing: Analyzing request stream...</span>
      </div>
    </div>
  )
}

/** 重型输入控制台 */
function HeavyInputConsole({
  value,
  onChange,
  onSend,
  onStop,
  onKeyDown,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="bg-card border-t-2 border-border z-20 p-0">
      {/* 输入流标签条 */}
      <div className="bg-[var(--accent)] h-1 w-full relative">
        <div className="absolute right-0 top-[-20px] bg-[var(--accent)] text-primary font-mono text-[9px] px-2 py-0.5 font-bold border-t-2 border-l-2 border-border">
          INPUT_STREAM
        </div>
      </div>

      {/* 输入区域 */}
      <div className="p-6 pb-6 pt-4 bg-page">
        <div className={cn(
          "bg-card border-2 border-border shadow-hard relative group transition-all",
          !disabled && "focus-within:shadow-[6px_6px_0_0_#facc15]"
        )}>
          {/* 行号 + 文本域 */}
          <div className="flex min-h-[100px]">
            <div className="w-10 py-4 text-right pr-3 font-mono text-xs text-primary/50 dark:text-primary/40 bg-page border-r-2 border-border/20 select-none leading-relaxed">
              01<br/>02<br/>03
            </div>
            <HeavyInputTextArea
              value={value}
              onChange={onChange}
              onKeyDown={onKeyDown}
              disabled={disabled}
            />
          </div>

          {/* 工具栏 */}
          <div className="flex justify-between items-center p-2 border-t-2 border-border bg-page">
            {/* 左侧：工具按钮 */}
            <div className="flex items-center gap-4 pl-2">
              {/* 工具按钮 */}
              <button
                disabled={disabled}
                className="text-primary hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                title="附件"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                disabled={disabled}
                className="text-primary hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                title="网络搜索"
              >
                <Globe className="w-4 h-4" />
              </button>
            </div>

            {/* 右侧：EXECUTE 按钮 / 停止按钮 */}
            {disabled && onStop ? (
              // 停止按钮（正在生成时显示）
              <button
                onClick={onStop}
                className="px-6 py-1.5 bg-[var(--logo-item-active)] text-inverted font-bold text-[10px] uppercase border-2 border-border transition-all flex items-center gap-2 shadow-sm hover:bg-[var(--accent)] hover:text-primary hover:border-border active:translate-y-[1px]"
                title={t('stop')}
              >
                <Square className="w-3 h-3" />
                {t('stop')}
              </button>
            ) : (
              // 执行按钮（空闲时显示）
              <button
                onClick={onSend}
                disabled={!value.trim()}
                className={cn(
                  "px-6 py-1.5 bg-primary text-inverted font-bold text-[10px] uppercase border-2 border-transparent transition-all flex items-center gap-2 shadow-sm",
                  value.trim() && "hover:bg-[var(--accent)] hover:text-primary hover:border-border active:translate-y-[1px]"
                )}
              >
                {t('execute')}
                <Terminal className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 输入文本域 - 带翻译 */
function HeavyInputTextArea({
  value,
  onChange,
  onKeyDown,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      placeholder={t('inputPlaceholder')}
      className="flex-1 bg-transparent border-none p-4 font-mono text-sm focus:ring-0 outline-none resize-none leading-relaxed placeholder:text-primary/40 dark:placeholder:text-primary/30 disabled:opacity-50"
      rows={3}
    />
  )
}


