/**
 * 消息项组件
 * 展示单条消息，支持用户消息和AI消息两种样式
 * 
 * [性能优化] v3.2.0
 * - 使用 React.memo + areEqual 深度比对
 * - 提取 Markdown 渲染组件到外部，避免重复创建
 * - 使用 useMemo 缓存 components 对象
 */

import { useState, useCallback, useRef, useEffect, memo, useMemo } from 'react'
import { Copy, Check, RefreshCw, Eye } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useTaskStore } from '@/store/taskStore'
import type { MessageItemProps } from '../types'
import { extractCodeBlocks, detectContentType, detectMediaUrl } from '../utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.css'
import { CodeBlock } from '@/components/ui/code-block'
import { SIMPLE_TASK_ID } from '@/constants/task'
import { StatusAvatar } from '@/components/ui/StatusAvatar'
import { logger } from '@/utils/logger'
import type { Components } from 'react-markdown'
import type { ArtifactType } from '@/types'

// 开发环境调试开关
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// ============================================================================
// 时间格式化工具
// ============================================================================

/**
 * 格式化消息时间戳
 * 显示为 MM-DD HH:mm 格式，跨年时显示年份
 */
function formatMessageTime(timestamp: string | number | Date | undefined): string {
  if (!timestamp) return ''
  
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const isSameYear = date.getFullYear() === now.getFullYear()
    
    // 格式化数字，补零
    const pad = (n: number) => n.toString().padStart(2, '0')
    const month = pad(date.getMonth() + 1)
    const day = pad(date.getDate())
    const hours = pad(date.getHours())
    const minutes = pad(date.getMinutes())
    
    // 同年显示 MM-DD HH:mm，跨年显示 YYYY-MM-DD HH:mm
    if (isSameYear) {
      return `${month}-${day} ${hours}:${minutes}`
    } else {
      return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`
    }
  } catch {
    return ''
  }
}

// ============================================================================
// 提取的 Markdown 渲染组件 (避免每次渲染重新创建)
// ============================================================================

interface MarkdownLinkProps {
  href?: string
  children?: React.ReactNode
  onLinkClick?: (href: string) => void
}

/**
 * Markdown 链接渲染组件
 * 支持图片/视频预览和普通链接
 */
const MarkdownLink = memo(function MarkdownLink({ 
  href = '', 
  children,
  onLinkClick 
}: MarkdownLinkProps) {
  const linkText = children?.toString() || ''
  
  // 🔥 检测是否为媒体链接（多种策略）
  const hasImageExt = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(href)
  const hasVideoExt = /\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(href)
  const isOssImage = /(oss-|aliyuncs|s3\.amazonaws|cloudfront|storage\.googleapis|blob\.core\.windows)\.com.*(watermark|image|img|photo|pic)/i.test(href)
  const textSuggestsImage = /图片|image|photo|pic|图/i.test(linkText)
  const urlHasImageParam = /[?&](image|img|url|src)=/i.test(href)
  
  const shouldRenderAsImage = hasImageExt || (isOssImage && textSuggestsImage) || urlHasImageParam
  const shouldRenderAsVideo = hasVideoExt
  
  if (shouldRenderAsImage) {
    const expireMatch = href.match(/[?&]Expires=(\d+)/)
    const isExpired = expireMatch && Number(expireMatch[1]) * 1000 < Date.now()
    
    return (
      <span className="block my-3">
        <img
          src={href}
          alt={linkText || 'Image'}
          className="max-w-full max-h-[300px] rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
          onClick={() => window.open(href, '_blank')}
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            target.nextElementSibling?.classList.remove('hidden')
          }}
        />
        {isExpired && (
          <span className="text-xs text-amber-600 block mt-1">
            ⚠️ 图片链接已过期，请重新生成
          </span>
        )}
        <a href={href} className="hidden text-accent hover:underline text-xs">
          {children}
        </a>
      </span>
    )
  }
  
  if (shouldRenderAsVideo) {
    return (
      <span className="block my-3">
        <video
          src={href}
          controls
          className="max-w-full max-h-[300px] rounded-lg shadow-md"
          preload="metadata"
          onError={(e) => {
            const target = e.target as HTMLVideoElement
            target.style.display = 'none'
            target.nextElementSibling?.classList.remove('hidden')
          }}
        >
          您的浏览器不支持视频播放
        </video>
        <a href={href} className="hidden text-accent hover:underline text-xs">
          {children}
        </a>
      </span>
    )
  }
  
  return (
    <a
      href={href}
      onClick={(e) => {
        if (href.startsWith('#')) {
          e.preventDefault()
          onLinkClick?.(href)
        }
      }}
      className="text-accent hover:underline cursor-pointer"
    >
      {children}
    </a>
  )
})

/**
 * Markdown 图片渲染组件
 */
const MarkdownImage = memo(function MarkdownImage({ 
  src, 
  alt 
}: { src?: string; alt?: string }) {
  const imageSrc = typeof src === 'string' ? src : ''
  const imageAlt = typeof alt === 'string' ? alt : 'Image'
  
  if (!imageSrc) return null
  
  return (
    <img
      src={imageSrc}
      alt={imageAlt}
      className="max-w-full max-h-[300px] rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity my-3"
      loading="lazy"
      onClick={() => window.open(imageSrc, '_blank')}
      onError={(e) => {
        const target = e.target as HTMLImageElement
        target.style.display = 'none'
      }}
    />
  )
})

interface MarkdownCodeProps {
  children?: React.ReactNode
  className?: string
}

/**
 * Markdown 代码渲染组件
 */
const MarkdownCode = memo(function MarkdownCode({ children, className }: MarkdownCodeProps) {
  const codeContent = String(children || '').replace(/\n$/, '')
  const isInline = !className?.includes('language-')
  const match = /language-(\w+)/.exec(className || '')
  const lang = match ? match[1] : ''
  
  // 行内代码
  if (isInline) {
    const hasImageExt = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(codeContent)
    const hasVideoExt = /\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(codeContent)
    
    if (hasImageExt || hasVideoExt) {
      const expireMatch = codeContent.match(/[?&]Expires=(\d+)/)
      const isExpired = expireMatch && Number(expireMatch[1]) * 1000 < Date.now()
      
      return (
        <span className="block my-3">
          {hasImageExt ? (
            <img
              src={codeContent}
              alt="Image"
              className="max-w-full max-h-[300px] rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
              onClick={() => window.open(codeContent, '_blank')}
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
              }}
            />
          ) : (
            <video
              src={codeContent}
              controls
              className="max-w-full max-h-[300px] rounded-lg shadow-md"
              preload="metadata"
              onError={(e) => {
                const target = e.target as HTMLVideoElement
                target.style.display = 'none'
              }}
            >
              您的浏览器不支持视频播放
            </video>
          )}
          {isExpired && (
            <span className="text-xs text-amber-600 block mt-1">
              ⚠️ 链接已过期，请重新生成
            </span>
          )}
          <code className="block mt-1 text-xs bg-muted px-1 py-0.5 rounded">
            {codeContent.slice(0, 60)}...
          </code>
        </span>
      )
    }
    
    return (
      <code className="bg-muted px-1.5 py-0.5 rounded text-sm">
        {children}
      </code>
    )
  }
  
  // 代码块
  return (
    <CodeBlock
      code={codeContent}
      language={lang}
      showLineNumbers={true}
      className="my-3 rounded-lg overflow-hidden"
    />
  )
})

// ============================================================================
// 主组件
// ============================================================================

function MessageItem({
  message,
  activeExpert,
  aiStatus = 'idle',
  onRegenerate,
  onLinkClick,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()
  
  // 🔥 用于存储复制成功提示的定时器，组件卸载时清理
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  // 🔥 修复：确保 content 是字符串
  const content = message.content || ''
  
  // 检查是否有可预览的代码块或媒体内容
  const codeBlocks = extractCodeBlocks(content)
  const mediaInfo = detectMediaUrl(content)
  const hasPreviewContent = codeBlocks.length > 0 || content.length > 200 || !!mediaInfo.url

  // 处理预览 - 将内容发送到 artifact 区域（使用新协议 taskStore）
  const handlePreview = useCallback(() => {
    const taskStore = useTaskStore.getState()
    
    // 🔥 优先检测媒体内容（图片/视频）
    const mediaInfo = detectMediaUrl(content)
    if (mediaInfo.type && mediaInfo.url) {
      const artifact = {
        id: crypto.randomUUID(),
        type: mediaInfo.type,
        title: mediaInfo.type === 'video' ? t('videoPreview') : t('imagePreview'),
        content: mediaInfo.url,
        sort_order: 0
      }
      
      taskStore.setMode('simple')
      taskStore.initializePlan({
        execution_plan_id: 'media_preview',
        summary: t('mediaPreviewMode'),
        estimated_steps: 1,
        execution_mode: 'sequential',
        tasks: [{
          id: SIMPLE_TASK_ID,
          expert_type: 'media',
          description: t('mediaPreviewDesc'),
          status: 'completed',
          sort_order: 0
        }]
      })
      
      taskStore.replaceArtifacts(SIMPLE_TASK_ID, [{
        id: artifact.id,
        type: artifact.type as ArtifactType,
        title: artifact.title,
        content: artifact.content,
        sortOrder: artifact.sort_order,
        createdAt: new Date().toISOString(),
        isPreview: true
      }])
      
      taskStore.selectTask(SIMPLE_TASK_ID)
      return
    }
    
    const detected = detectContentType(codeBlocks, content)
    if (!detected && content.length <= 200) return

    const artifact = {
      id: crypto.randomUUID(),
      type: detected?.type || 'markdown',
      title: detected?.type === 'code' ? t('codePreview') 
        : detected?.type === 'html' ? 'HTML 预览' 
        : t('messagePreview'),
      content: detected?.content || content,
      language: detected?.language,
      sort_order: 0
    }

    const hasSimpleTask = taskStore.mode === 'simple' && taskStore.tasks.has(SIMPLE_TASK_ID)
    
    if (!hasSimpleTask) {
      if (DEBUG) logger.debug('[Preview] Initializing simple mode')
      taskStore.setMode('simple')
      taskStore.initializePlan({
        execution_plan_id: 'simple_preview',
        summary: t('simpleChatMode'),
        estimated_steps: 1,
        execution_mode: 'sequential',
        tasks: [{
          id: SIMPLE_TASK_ID,
          expert_type: 'assistant',
          description: t('simpleChatPreviewDesc'),
          status: 'completed',
          sort_order: 0
        }]
      })
    } else {
      taskStore.setMode('simple')
    }
    
    if (DEBUG) logger.debug('[Preview] Replacing artifact:', artifact.title, 'to task:', SIMPLE_TASK_ID)
    taskStore.replaceArtifacts(SIMPLE_TASK_ID, [{
      id: artifact.id,
      type: artifact.type as ArtifactType,
      title: artifact.title,
      content: artifact.content,
      language: artifact.language,
      sortOrder: artifact.sort_order,
      createdAt: new Date().toISOString(),
      isPreview: true
    }])
    
    taskStore.selectTask(SIMPLE_TASK_ID)
  }, [content, codeBlocks, t])

  // 处理复制
  const handleCopy = useCallback(async () => {
    const textToCopy = content
    if (!textToCopy) return

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy)
        setCopied(true)
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
        return
      }

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

      const successful = document.execCommand('copy')
      if (successful) {
        setCopied(true)
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
      }

      document.body.removeChild(textarea)
    } catch {
      // 复制失败静默处理
    }
  }, [content])

  // 处理重试
  const handleRetry = useCallback(() => {
    if (message.id && onRegenerate) {
      onRegenerate(message.id)
    }
  }, [message.id, onRegenerate])

  // 🔥 性能优化：使用 useMemo 缓存 Markdown components 对象
  const markdownComponents = useMemo<Components>(() => ({
    a: ({ node: _node, ...props }) => <MarkdownLink {...props} onLinkClick={onLinkClick} />,
    img: ({ node: _node, ...props }) => <MarkdownImage {...props} />,
    code: ({ node: _node, ...props }) => <MarkdownCode {...props} />
  }), [onLinkClick])

  // 用户消息：使用 surface 颜色，与背景形成层次感
  if (isUser) {
    return (
      <div className="flex flex-col items-end group user-message">
        <div className="flex items-center gap-2 mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <span className="font-mono text-[9px] uppercase text-content-muted">
            {message.timestamp ? formatMessageTime(message.timestamp) : ''}
          </span>
        </div>
        <div className="bg-surface-elevated text-content-primary p-5 shadow-hard border-2 border-border-default w-fit max-w-[80%] select-text">
          <div className="flex gap-3">
            <span className="font-mono text-accent-brand font-bold shrink-0">&gt;_</span>
            <p className="font-mono text-sm leading-relaxed whitespace-pre-wrap select-text text-content-primary">
              {content}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // AI 消息：无气泡，全宽展示（现代 AI 界面风格）
  return (
    <div className="flex flex-col items-start w-full select-text ai-message group">
      {/* 头部：头像 + 标签 + 时间 */}
      <div className="flex items-center gap-2 mb-3">
        <StatusAvatar 
          status={aiStatus}
          className="w-6 h-6"
        />
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          {activeExpert ? `${activeExpert.toUpperCase()}_AGENT` : 'ASSISTANT'}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/50">
          {formatMessageTime(message.timestamp)}
        </span>
      </div>

      {/* 内容区：无气泡背景，直接展示 */}
      <div className="w-full pl-7 prose prose-sm max-w-none
        prose-headings:text-sm prose-headings:font-bold prose-headings:text-content-primary
        prose-p:text-sm prose-p:leading-relaxed prose-p:text-content-primary/90
        prose-strong:text-content-primary prose-code:text-content-primary prose-pre:bg-surface-elevated/50 
        prose-pre:border prose-pre:border-border-default/30 prose-a:text-accent hover:prose-a:text-accent-hover
        select-text">
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        ) : aiStatus !== 'idle' ? (
          <span className="text-muted-foreground/50 italic">
            {aiStatus === 'thinking' ? '思考中...' : '生成中...'}
          </span>
        ) : null}
      </div>

      {/* 底部操作栏：悬停显示，更简洁 */}
      <div className="pl-7 mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {hasPreviewContent && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handlePreview()
            }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
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
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
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
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
            title={t('regenerate')}
          >
            <RefreshCw className="w-3 h-3" />
            {t('retry')}
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// 性能优化：自定义 areEqual 函数
// 只比较影响 UI 的关键字段，忽略函数引用变化
// ============================================================================

function areEqual(prevProps: MessageItemProps, nextProps: MessageItemProps): boolean {
  // 比较 message 关键字段
  const prevMsg = prevProps.message
  const nextMsg = nextProps.message
  
  if (prevMsg.id !== nextMsg.id) return false
  if (prevMsg.content !== nextMsg.content) return false
  if (prevMsg.role !== nextMsg.role) return false
  if (prevMsg.timestamp !== nextMsg.timestamp) return false
  
  // 比较 metadata.thinking 长度（thinking 步骤变化）
  const prevThinkingLength = prevMsg.metadata?.thinking?.length ?? 0
  const nextThinkingLength = nextMsg.metadata?.thinking?.length ?? 0
  if (prevThinkingLength !== nextThinkingLength) return false
  
  // 比较其他 UI 相关 props
  if (prevProps.aiStatus !== nextProps.aiStatus) return false
  if (prevProps.activeExpert !== nextProps.activeExpert) return false
  if (prevProps.isLast !== nextProps.isLast) return false
  
  // 🔥 忽略函数引用变化：onRegenerate, onLinkClick, onPreview
  // 这些函数应该由父组件用 useCallback 缓存
  return true
}

export default memo(MessageItem, areEqual)
