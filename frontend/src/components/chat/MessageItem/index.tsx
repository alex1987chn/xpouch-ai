/**
 * 消息项组件
 * 展示单条消息，支持用户消息和AI消息两种样式
 * 
 * [性能优化] v3.2.0
 * - 使用 React.memo + areEqual 深度比对
 * - 提取 Markdown 渲染组件到外部，避免重复创建
 * - 使用 useMemo 缓存 components 对象
 */

import { useState, useCallback, useRef, useLayoutEffect, memo, useMemo } from 'react'
import { Copy, Check, RefreshCw, FileText, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { MessageItemProps } from '../types'
import { extractCodeBlocks, detectContentType, detectMediaUrl } from '../utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.css'
import { CodeBlock } from '@/components/ui/code-block'
import { toLocalDate } from '@/lib/datetime'
import ArtifactViewerModal from '@/components/artifacts/ArtifactViewerModal'
import { cn } from '@/lib/utils'
import type { Components } from 'react-markdown'
import { useCopy } from '@/hooks/useCopy'
import { expertColor, expertLabel } from '@/lib/expertIdentity'
import { getArtifactDetail } from '@/services/artifacts'
import type { ExpertMessageData, Message } from '@/types'
import { Loader2, Wrench } from 'lucide-react'

// 开发环境调试开关
/** AI 长文折叠阈值（px，实测渲染高度超过即收起） */
const COLLAPSE_HEIGHT = 560

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
    // 字符串一律过 toLocalDate：后端返回**无时区的 UTC naive**，裸 new Date 会按本地解析
    // 导致恢复出来的历史消息时间差一个时区（UTC+8 下少 8 小时；实时消息带 Z 故正常）。
    // 数字/Date 走原路（调用方已给出真实时刻）。
    const date = typeof timestamp === 'string' ? toLocalDate(timestamp) : new Date(timestamp)
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
  const { t } = useTranslation()
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
            ⚠️ {t('imageLinkExpired')}
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
          {t('videoNotSupported')}
        </video>
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
      className="cursor-pointer text-content-primary underline decoration-border-hover underline-offset-2 hover:text-accent-hover"
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
  const { t } = useTranslation()
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
              {t('videoUnsupported')}
            </video>
          )}
          {isExpired && (
            <span className="text-xs text-amber-600 block mt-1">
              ⚠️ {t('linkExpired')}
            </span>
          )}
          <code className="block mt-1 text-xs bg-surface-tint px-1 py-0.5 rounded">
            {codeContent.slice(0, 60)}...
          </code>
        </span>
      )
    }
    
    return (
      <code className="bg-surface-tint px-1.5 py-0.5 rounded text-sm">
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
  aiStatus = 'idle',
  onRegenerate,
  onLinkClick,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const { copied, copy } = useCopy()
  const { t } = useTranslation()

  // 长文折叠：完成态且实测高度超限时收起（渐隐 + 展开全文）
  const bodyRef = useRef<HTMLDivElement>(null)
  const [bodyOverflow, setBodyOverflow] = useState(false)
  const [bodyExpanded, setBodyExpanded] = useState(false)
  const isBusy = aiStatus === 'thinking' || aiStatus === 'streaming'
  const contentCollapsed = !isUser && !isBusy && bodyOverflow && !bodyExpanded

  // 文档视图：消息内容送产物弹框的静态文档模式
  const [docView, setDocView] = useState<{ type: string; title: string; content: string; language?: string | null } | null>(null)
  // 🔥 修复：确保 content 是字符串
  const content = message.content || ''

  useLayoutEffect(() => {
    if (isUser) return
    const el = bodyRef.current
    if (el) setBodyOverflow(el.scrollHeight > COLLAPSE_HEIGHT)
  }, [content, isUser])
  
  // 检查是否有可预览的代码块或媒体内容
  const codeBlocks = extractCodeBlocks(content)
  const mediaInfo = detectMediaUrl(content)
  const hasPreviewContent = codeBlocks.length > 0 || content.length > 200 || !!mediaInfo.url

  // 处理预览 - 将内容发送到 artifact 区域（使用新协议 taskStore）
  // 文档视图：内容进产物弹框（静态只读，支持复制/导出 PDF），不再写 taskStore
  const handlePreview = useCallback(() => {
    if (mediaInfo.type && mediaInfo.url) {
      setDocView({
        type: mediaInfo.type,
        title: mediaInfo.type === 'video' ? t('videoPreview') : t('imagePreview'),
        content: mediaInfo.url,
      })
      return
    }
    const detected = detectContentType(codeBlocks, content)
    const firstLine = content.split('\n').find(l => l.trim()) || ''
    setDocView({
      type: detected?.type || 'markdown',
      title: firstLine.replace(/[#*`>-]+/g, '').trim().slice(0, 24) || t('messagePreview'),
      content: detected?.content || content,
      language: detected?.language ?? null,
    })
  }, [content, codeBlocks, mediaInfo, t])

  // 处理复制（降级与 copied 复位都在 useCopy 里）
  const handleCopy = useCallback(async () => {
    if (!content) return
    await copy(content)
  }, [content, copy])

  // 处理重试
  const handleRetry = useCallback(() => {
    if (message.id && onRegenerate) {
      onRegenerate(message.id)
    }
  }, [message.id, onRegenerate])

  // 🔥 性能优化：使用 useMemo 缓存 Markdown components 对象
  const markdownComponents = useMemo(() => buildMarkdownComponents(onLinkClick), [onLinkClick])

  // 用户消息：暖调浅底圆角气泡，右对齐（蓝本 .msg-user）；附件以 chips 展示
  // （名字/数量来自消息 extra_data 元数据——文档文本与图片本体都不在展示层）
  if (isUser) {
    const extra = message.extra_data as Record<string, unknown> | undefined
    const attachmentData =
      extra && extra.message_kind === undefined
        ? (extra as { documents?: { name: string }[]; image_count?: number })
        : undefined
    const docNames = attachmentData?.documents?.map((d: { name: string }) => d.name) ?? []
    const imageCount = attachmentData?.image_count ?? 0
    const hasAttachments = docNames.length > 0 || imageCount > 0
    return (
      <div className="flex flex-col items-end group user-message">
        <div className="mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <span className="text-nano text-content-muted">
            {message.timestamp ? formatMessageTime(message.timestamp) : ''}
          </span>
        </div>
        <div className="w-fit max-w-[78%] select-text rounded-md border border-border-divider bg-surface-tint p-2.5 px-3.5 shadow-theme-card">
          {hasAttachments && (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {imageCount > 0 && (
                <span className="flex items-center gap-1 rounded-sm bg-surface-card px-1.5 py-0.5 text-tiny text-content-secondary">
                  <ImageIcon className="h-3 w-3" />
                  {t('attachmentImages', { count: imageCount })}
                </span>
              )}
              {docNames.map(name => (
                <span
                  key={name}
                  className="flex min-w-0 items-center gap-1 rounded-sm bg-surface-card px-1.5 py-0.5 text-tiny text-content-secondary"
                  title={name}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="max-w-[160px] truncate">{name}</span>
                </span>
              ))}
            </div>
          )}
          <p className="whitespace-pre-wrap text-body leading-[1.65] text-content-primary">
            {content}
          </p>
        </div>
      </div>
    )
  }

  // 专家执行消息（真相源=消息表）：紧凑卡——专家署名 + 任务描述 + 摘要 +
  // 工具统计 + artifact 横条（点击拉详情进 docView 预览）。执行中显示当前
  // 工具活动（metadata 运行时态），完成后由 extra_data 终态接管。
  const expertExtra =
    (message.extra_data as ExpertMessageData | undefined)?.message_kind === 'expert_result'
      ? (message.extra_data as ExpertMessageData)
      : null
  if (expertExtra) {
    return <ExpertResultCard message={message} extra={expertExtra} />
  }

  // AI 消息：无气泡，全宽排版 + 专家署名行（识别色点 + 显示名，蓝本 .byline）
  return (
    <div className="flex flex-col items-start w-full select-text ai-message group">
      {/* 署名行：中性色点 + 助手名 + 时间 */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="h-[7px] w-[7px] rounded-full bg-content-muted/45" />
        <span className="text-tiny text-content-muted">
          {t('aiBylineFallback')}
        </span>
        <span className="text-nano text-content-muted/60">
          {formatMessageTime(message.timestamp)}
        </span>
      </div>

      {/* 内容区：无气泡背景，直接展示（蓝本 13.5px / 1.75 行高）；长文收起 */}
      <div ref={bodyRef} className={cn(
        'w-full text-body leading-[1.75] prose prose-sm max-w-none',
        'prose-headings:text-sm prose-headings:font-bold prose-headings:text-content-primary',
        'prose-p:text-body prose-p:leading-[1.75] prose-p:text-content-primary/90',
        'prose-strong:text-content-primary prose-code:text-content-primary prose-pre:bg-surface-elevated/50',
        'prose-pre:border prose-pre:border-border-default/30 prose-a:text-content-primary prose-a:underline prose-a:decoration-border-hover prose-a:underline-offset-2 hover:prose-a:text-accent-hover',
        'select-text',
        contentCollapsed && 'relative max-h-[560px] overflow-hidden'
      )}>
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        ) : aiStatus !== 'idle' ? (
          <span className="text-content-muted/50 italic">
            {aiStatus === 'thinking' ? t('aiThinkingPlaceholder') : t('aiGeneratingPlaceholder')}
          </span>
        ) : null}
      </div>

      {contentCollapsed && (
        <div className="pointer-events-none relative -mt-10 h-10">
          <div className="absolute inset-0 bg-gradient-to-t from-surface-page to-transparent" />
        </div>
      )}
      {contentCollapsed && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setBodyExpanded(true)
          }}
          className="flex items-center gap-1 text-micro font-medium text-content-muted transition-colors hover:text-content-primary"
        >
          {t('expandAll')}
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
      {!contentCollapsed && bodyOverflow && !isBusy && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setBodyExpanded(false)
          }}
          className="flex items-center gap-1 text-micro font-medium text-content-muted transition-colors hover:text-content-primary"
        >
          {t('collapseAll')}
          <ChevronUp className="h-3 w-3" />
        </button>
      )}

      {/* 底部操作栏：悬停显示，更简洁 */}
      <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {hasPreviewContent && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handlePreview()
            }}
            className="flex items-center gap-1 text-micro text-content-muted hover:text-content-primary px-2 py-1 rounded hover:bg-surface-tint/60 transition-colors cursor-pointer"
            title={t('docView')}
          >
            <FileText className="w-3 h-3" />
            {t('docView')}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleCopy()
          }}
          className="flex items-center gap-1 text-micro text-content-muted hover:text-content-primary px-2 py-1 rounded hover:bg-surface-tint/60 transition-colors cursor-pointer"
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
            className="flex items-center gap-1 text-micro text-content-muted hover:text-content-primary px-2 py-1 rounded hover:bg-surface-tint/60 transition-colors cursor-pointer"
            title={t('regenerate')}
          >
            <RefreshCw className="w-3 h-3" />
            {t('retry')}
          </button>
        )}
      </div>

      <ArtifactViewerModal artifactId={null} docArtifact={docView} onClose={() => setDocView(null)} />
    </div>
  )
}

// ============================================================================
// Markdown components 工厂（主组件与专家卡共用；链接回调可选）
function buildMarkdownComponents(onLinkClick?: MessageItemProps['onLinkClick']): Components {
  return {
    a: ({ node: _node, ...props }) => <MarkdownLink {...props} onLinkClick={onLinkClick} />,
    img: ({ node: _node, ...props }) => <MarkdownImage {...props} />,
    code: ({ node: _node, ...props }) => <MarkdownCode {...props} />
  }
}

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
  if (prevMsg.extra_data !== nextMsg.extra_data) return false

  // 比较 metadata.thinking 长度（thinking 步骤变化）
  const prevThinkingLength = prevMsg.metadata?.thinking?.length ?? 0
  const nextThinkingLength = nextProps.message.metadata?.thinking?.length ?? 0
  if (prevThinkingLength !== nextThinkingLength) return false

  // 工具活动序列（metadata.toolCalls）：条数或末项状态变化都要重渲染
  const prevCalls = prevMsg.metadata?.toolCalls
  const nextCalls = nextMsg.metadata?.toolCalls
  if (prevCalls !== nextCalls) return false

  // 比较其他 UI 相关 props
  if (prevProps.aiStatus !== nextProps.aiStatus) return false

  // 🔥 忽略函数引用变化：onRegenerate, onLinkClick
  // 这些函数应该由父组件用 useCallback 缓存
  return true
}

/**
 * 专家执行结果卡（message_kind='expert_result'）。
 *
 * 数据分层：extra_data 是服务端真相（终态：摘要/产物引用/工具明细快照）；
 * metadata.toolCalls 是执行期间的实时活动序列（逐次追加，完成后被终态取代）。
 * 交互：完成后工具汇总行与产出全文均可展开——明细直接读快照，全文惰性拉
 * artifact 就地 markdown 渲染（不打断消息流，替代强制弹窗）。
 */
function ExpertResultCard({
  message,
  extra,
}: {
  message: Message
  extra: ExpertMessageData
}) {
  const { t } = useTranslation()
  const [docView, setDocView] = useState<{
    type: string
    title: string
    content: string
    language?: string | null
  } | null>(null)
  const [loadingArtifact, setLoadingArtifact] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [descOpen, setDescOpen] = useState(false)

  const color = expertColor(extra.expert_type)
  const name = expertLabel(extra.expert_type, t)
  const running = extra.status === 'running'
  const failed = extra.status === 'failed'
  const liveCalls = message.metadata?.toolCalls
  const toolStats = extra.tool_stats
  // 明细：终态优先（服务端快照），实时态用运行时序列
  const detailCalls = !running ? extra.tool_calls : liveCalls

  const openArtifact = async (artifactId: string) => {
    if (loadingArtifact) return
    setLoadingArtifact(true)
    try {
      const artifact = await getArtifactDetail(artifactId)
      setDocView({
        type: artifact.type,
        title: artifact.title || name,
        content: artifact.content ?? '',
        language: artifact.language ?? null,
      })
    } finally {
      setLoadingArtifact(false)
    }
  }

  const formatMs = (ms?: number | null) =>
    ms == null ? null : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

  // 任务描述较长时提供展开/收起（默认一行截断，悬停 title 看全文的兜底保留）
  const descLong = extra.task_description.length > 48

  // 实时活动：序列全部保留在状态里，渲染最近 3 条（旧的收进计数）
  const visibleLive = (liveCalls ?? []).slice(-3)
  const hiddenLiveCount = (liveCalls ?? []).length - visibleLive.length

  return (
    <div
      className="flex w-full flex-col items-start select-text ai-message group border-l-2 py-0.5 pl-3"
      style={{ borderLeftColor: color }}
    >
      {/* 署名行：专家识别色点 + 名称 + 步骤序号 + 耗时/状态 */}
      <div className="mb-1 flex items-center gap-1.5">
        <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: color }} />
        <span className="text-tiny font-bold" style={{ color }}>
          {name}
        </span>
        {extra.total_steps > 0 && (
          <span className="text-nano text-content-muted">
            · {t('expertStepLabel', { index: (extra.sort_order ?? 0) + 1, total: extra.total_steps })}
          </span>
        )}
        {running ? (
          <span className="shimmer" />
        ) : (
          formatMs(extra.duration_ms) && (
            <span className="text-nano text-content-muted/60">· {formatMs(extra.duration_ms)}</span>
          )
        )}
        {failed && <span className="text-nano text-accent-destructive">· {t('expertTaskFailed')}</span>}
      </div>

      {/* 任务描述：默认一行截断（悬停 title 兜底），长描述提供展开/收起 */}
      <div className="flex w-full items-start gap-1">
        <p
          className={cn(
            'min-w-0 flex-1 text-sm text-content-secondary',
            descOpen ? 'whitespace-pre-wrap break-words' : 'truncate'
          )}
          title={!descOpen ? extra.task_description : undefined}
        >
          {extra.task_description}
        </p>
        {descLong && (
          <button
            type="button"
            onClick={() => setDescOpen(v => !v)}
            className="mt-0.5 shrink-0 text-content-muted transition-colors hover:text-content-secondary"
            title={descOpen ? t('expertCollapseOutput') : t('expertExpandDesc')}
          >
            {descOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* 完成摘要（1 行截断）——有产物横条时不重复显示（横条标题=产出首行） */}
      {!running && !failed && extra.summary && (extra.artifact_ids ?? []).length === 0 && (
        <p className="mt-0.5 w-full truncate text-xs text-content-muted">{extra.summary}</p>
      )}

      {/* 失败详情 */}
      {failed && extra.error && (
        <p className="mt-0.5 w-full truncate text-xs text-accent-destructive" title={extra.error}>
          {extra.error}
        </p>
      )}

      {/* 工具区。
          执行中：实时活动序列（逐次追加，最近 3 条可见，calling 项转圈）。
          完成后：汇总行（N 次 · 总耗时），点击展开逐次明细（终态快照）。 */}
      {running && visibleLive.length > 0 && (
        <div className="mt-1 flex w-full flex-col gap-0.5">
          {hiddenLiveCount > 0 && (
            <span className="text-nano text-content-muted/70">
              … {t('expertEarlierCalls', { count: hiddenLiveCount })}
            </span>
          )}
          {visibleLive.map((call, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-content-muted">
              <Wrench className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono">{call.tool}</span>
              {call.source === 'mcp' && (
                <span className="shrink-0 rounded-sm border border-border-divider px-1 text-nano">MCP</span>
              )}
              {call.status === 'calling' ? (
                <>
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  <span>{t('thinkingToolCalling')}</span>
                </>
              ) : (
                <span className={call.success ? 'text-status-online' : 'text-status-offline'}>
                  {call.success ? '✓' : '✗'} {formatMs(call.duration_ms)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {!running && toolStats && toolStats.count > 0 && (
        <>
          <button
            type="button"
            onClick={() => setToolsOpen(v => !v)}
            className="mt-1 flex items-center gap-1.5 text-xs text-content-muted transition-colors hover:text-content-secondary"
          >
            <Wrench className="h-3 w-3 shrink-0" />
            <span>
              {toolStats.count} {t('thinkingToolCalls')}
              {toolStats.failed > 0 && (
                <span className="text-status-offline">（{toolStats.failed} ✗）</span>
              )}
            </span>
            <span>· {formatMs(toolStats.total_ms)}</span>
            {toolsOpen ? (
              <ChevronUp className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            )}
          </button>
          {toolsOpen && (detailCalls ?? []).length > 0 && (
            <div className="mt-1 flex w-full flex-col gap-0.5 rounded-md border border-border-divider bg-surface-tint/40 px-2.5 py-1.5">
              {(detailCalls ?? []).map((call, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-content-muted">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      call.success === false ? 'bg-status-offline' : 'bg-status-online'
                    }`}
                  />
                  <span className="truncate font-mono">{call.tool}</span>
                  {call.source === 'mcp' && (
                    <span className="shrink-0 rounded-sm border border-border-divider px-1 text-nano">MCP</span>
                  )}
                  <span className="ml-auto shrink-0">{formatMs(call.duration_ms)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* artifact 横条：产物标题（取产出首行——通常是报告标题；无则默认文案）
          + 预览入口（点击拉详情弹预览，loading 防抖） */}
      {(extra.artifact_ids ?? []).length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1.5 w-full">
          {(extra.artifact_ids ?? []).map((artifactId, i) => {
            const barTitle =
              i === 0 ? (extra.summary || '').replace(/^#+\s*/, '').trim() : ''
            return (
              <button
                key={artifactId}
                type="button"
                onClick={() => openArtifact(artifactId)}
                className="flex w-full items-center gap-2 rounded-md border border-border-divider bg-surface-tint/60 px-3 py-2 text-left transition-colors hover:border-border-hover hover:bg-surface-tint"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-content-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-content-secondary">
                  {barTitle || t('expertArtifactPreview')}
                </span>
                {loadingArtifact ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-content-muted" />
                ) : (
                  <span className="shrink-0 text-nano text-content-muted">{t('expertPreviewAction')}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* docView 弹框（复用正文消息的静态文档预览） */}
      {docView && (
        <ArtifactViewerModal artifactId={null} docArtifact={docView} onClose={() => setDocView(null)} />
      )}
    </div>
  )
}

export default memo(MessageItem, areEqual)
