import { useRef, useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Terminal, Paperclip, Globe, Copy, Check, RefreshCw } from 'lucide-react'
import type { Message } from '@/store/chatStore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useTranslation } from '@/i18n'

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
  /** 当前活跃专家 (用于显示路由指示器) */
  activeExpert?: string | null
  /** 重新生成消息回调 */
  onRegenerate?: (messageId: string) => void
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
  activeExpert,
  onRegenerate,
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
        onKeyDown={handleKeyDown}
        disabled={isGenerating}
      />
    </>
  )
}

// ============ 子组件 ============

/** 空状态 */
function EmptyState() {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
      <div className="w-16 h-16 border-2 border-dashed border-border flex items-center justify-center mb-4">
        <Terminal className="w-8 h-8" />
      </div>
      <p className="font-mono text-xs uppercase tracking-widest">
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
}: {
  message: Message
  isLast: boolean
  activeExpert?: string | null
  onRegenerate?: (messageId: string) => void
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()
  
  // 处理复制
  const handleCopy = useCallback(async () => {
    const textToCopy = message.content || ''
    if (!textToCopy) {
      console.warn('No content to copy')
      return
    }

    try {
      // 首选: Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        return
      }

      // 降级方案: 使用 textarea 复制
      const textarea = document.createElement('textarea')
      textarea.value = textToCopy
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()

      try {
        const successful = document.execCommand('copy')
        if (successful) {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } else {
          console.error('execCommand copy failed')
        }
      } catch (err) {
        console.error('Fallback copy failed:', err)
      } finally {
        document.body.removeChild(textarea)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [message.content])
  
  // 处理重试
  const handleRetry = useCallback(() => {
    if (message.id && onRegenerate) {
      onRegenerate(message.id)
    }
  }, [message.id, onRegenerate])
  
  if (isUser) {
    // 用户消息：深色代码块风格
    return (
      <div className="flex flex-col items-end group">
        <div className="flex items-center gap-2 mb-1 opacity-40 group-hover:opacity-100 transition-opacity">
          <span className="font-mono text-[9px] uppercase">ID: {String(message.id ?? '').slice(0, 6)} // USER</span>
        </div>
        <div className="bg-primary text-inverted p-5 shadow-hard border-2 border-transparent w-fit max-w-[80%]">
          <div className="flex gap-3">
            <span className="font-mono text-[var(--accent)] font-bold shrink-0">&gt;_</span>
            <p className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // AI 消息：左侧色条容器 + 路由指示器
  return (
    <div className="flex flex-col items-start w-full max-w-3xl">
      {/* 路由指示器 (仅在复杂模式且不是最后一条时显示) */}
      {activeExpert && !isLast && (
        <RoutingIndicator expertType={activeExpert} />
      )}
      
      {/* 消息内容 */}
      <div className="bg-card border-2 border-border border-l-[6px] border-l-[var(--accent)] p-6 w-full shadow-sm relative">
        {/* 标签 */}
        <div className="absolute top-0 right-0 bg-[var(--accent)] text-primary font-mono text-[9px] px-2 py-0.5 font-bold">
          {activeExpert ? `${activeExpert.toUpperCase()}_RESPONSE` : 'FINAL_PLAN'}
        </div>
        
        {/* Markdown 内容 */}
        <div className="prose prose-sm max-w-none prose-headings:text-sm prose-headings:font-bold prose-p:text-sm prose-p:leading-relaxed prose-pre:bg-panel prose-pre:border prose-pre:border-border/20">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* 底部操作栏 */}
        <div className="mt-4 pt-3 border-t border-border/20 flex justify-between items-center">
          <span className="font-mono text-[10px] text-secondary">
            TOKENS: {message.content.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] font-bold hover:bg-primary hover:text-inverted px-2 py-1 transition-colors"
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
                onClick={handleRetry}
                className="flex items-center gap-1 text-[10px] font-bold hover:bg-primary hover:text-inverted px-2 py-1 transition-colors"
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
    <div className="flex items-center gap-2 mb-0 ml-4 pl-4 border-l-2 border-dashed border-border/30 h-6">
      <span className="font-mono text-[9px] bg-panel px-1 text-secondary">ROUTING</span>
      <span className="text-secondary">→</span>
      <span className="font-mono text-[9px] font-bold border border-border px-1 bg-card">
        {expertType.toUpperCase()}_AGENT
      </span>
    </div>
  )
}

/** 生成中指示器 */
function GeneratingIndicator() {
  return (
    <div className="flex flex-col items-start w-full max-w-3xl ml-4 pl-4 border-l-2 border-dashed border-border/30 pb-4">
      <div className="bg-card border border-border border-dashed p-3 w-fit flex items-center gap-2 text-xs font-mono text-secondary animate-pulse">
        <span className="w-3 h-3 border-2 border-border border-t-transparent rounded-full animate-spin" />
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
  onKeyDown,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
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
            <div className="w-10 py-4 text-right pr-3 font-mono text-xs text-secondary bg-page border-r-2 border-border/20 select-none leading-relaxed">
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
                className="hover:text-primary text-secondary transition-colors disabled:opacity-50"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                disabled={disabled}
                className="hover:text-primary text-secondary transition-colors disabled:opacity-50"
              >
                <Globe className="w-4 h-4" />
              </button>
            </div>

            {/* 右侧：EXECUTE 按钮 */}
            <button
              onClick={onSend}
              disabled={disabled || !value.trim()}
              className={cn(
                "px-6 py-1.5 bg-primary text-inverted font-bold text-[10px] uppercase border-2 border-transparent transition-all flex items-center gap-2 shadow-sm",
                !disabled && value.trim() && "hover:bg-[var(--accent)] hover:text-primary hover:border-border active:translate-y-[1px]"
              )}
            >
              {disabled ? (
                <>
                  <span className="w-3 h-3 border-2 border-inverted border-t-transparent rounded-full animate-spin" />
                  {t('processing')}
                </>
              ) : (
                <>
                  {t('execute')}
                  <Terminal className="w-3 h-3" />
                </>
              )}
            </button>
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
      className="flex-1 bg-transparent border-none p-4 font-mono text-sm focus:ring-0 outline-none resize-none leading-relaxed placeholder-secondary disabled:opacity-50"
      rows={3}
    />
  )
}


