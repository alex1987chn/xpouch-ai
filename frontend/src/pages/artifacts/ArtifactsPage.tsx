/**
 * =============================
 * ArtifactsPage - 产物中心
 * =============================
 *
 * 跨会话浏览所有产物：类型过滤 + 分页 + 点击查看详情（完整渲染）。
 * 布局遵循内容页规范（max-w-5xl），标题习语照抄 LibraryPage。
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Expand, Share2, Shrink } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useArtifactsQuery } from '@/hooks/queries/useArtifactsQuery'
import { getArtifactDetail, shareArtifact } from '@/services/artifacts'
import { logger } from '@/utils/logger'
import { Z_INDEX } from '@/constants/zIndex'
import type { ArtifactListItem } from '@/types'
import ArtifactRenderer from '@/components/artifacts/ArtifactRenderer'
import { cn } from '@/lib/utils'

const TYPE_FILTERS = [
  { key: '', label: 'artifactsFilterAll' },
  { key: 'code', label: 'artifactsFilterCode' },
  { key: 'html', label: 'artifactsFilterHtml' },
  { key: 'markdown', label: 'artifactsFilterMarkdown' },
  { key: 'search', label: 'artifactsFilterReport' },
  { key: 'image', label: 'artifactsFilterImage' },
] as const

const TYPE_COLORS: Record<string, string> = {
  code: '#2f6df6',
  html: '#e8632c',
  markdown: '#16a34a',
  search: '#8b5cf6',
  text: '#6b7280',
  image: '#db2777',
  video: '#0891b2',
  media: '#0891b2',
}

function formatDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

export default function ArtifactsPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [detail, setDetail] = useState<ArtifactListItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

  const { data, isLoading, isError, error } = useArtifactsQuery(page, typeFilter || undefined)

  const openDetail = async (item: ArtifactListItem) => {
    setDetail(item) // 先用列表预览占位
    setDetailLoading(true)
    try {
      const full = await getArtifactDetail(item.id)
      setDetail(full)
    } catch {
      // 保持占位内容，用户仍可关闭
    } finally {
      setDetailLoading(false)
    }
  }

  // 分享当前详情产物：生成公开链接并复制到剪贴板
  const handleShare = async () => {
    if (!detail) return
    setIsSharing(true)
    try {
      const { path } = await shareArtifact(detail.id)
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch (err) {
      logger.error('Share failed:', err)
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-page px-6 md:px-12 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* 标题行（LibraryPage 习语） */}
        <div className="flex justify-between items-end border-b-2 border-border pb-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-accent-brand" />
            <span className="font-mono text-content-muted">///</span>
            <h1 className="text-xl font-black uppercase tracking-widest text-content-primary">
              {t('artifactsTitle')}
            </h1>
          </div>
          {data && (
            <div className="font-mono text-micro text-content-secondary">
              {data.total} {t('artifactsTotalSuffix')}
            </div>
          )}
        </div>

        {/* 类型过滤 */}
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => {
                setTypeFilter(f.key)
                setPage(1)
              }}
              className={cn(
                'px-3 py-1 border-2 font-mono text-xs uppercase tracking-wider transition-all duration-150',
                typeFilter === f.key
                  ? 'bg-content-primary text-surface-page border-border'
                  : 'bg-surface-card text-content-secondary border-border-default',
                'hover:border-accent hover:text-content-primary',
                'active:[transform:var(--transform-button-active)]'
              )}
            >
              {t(f.label)}
            </button>
          ))}
        </div>

        {/* 列表 */}
        {isLoading && (
          <div className="py-20 text-center font-mono text-sm text-content-muted">
            {t('loading')}...
          </div>
        )}

        {isError && (
          <div className="py-20 text-center font-mono text-sm text-status-error">
            {(error as Error)?.message || t('loadFailed')}
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="py-20 text-center font-mono text-sm text-content-muted">
            {t('artifactsEmpty')}
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.items.map(item => {
              const color = TYPE_COLORS[item.type] || '#6b7280'
              return (
                <button
                  key={item.id}
                  onClick={() => openDetail(item)}
                  className="text-left border-2 border-border-default bg-surface-card p-4 flex flex-col gap-3 min-h-[160px] transition-all duration-150 hover:border-accent hover:[transform:var(--transform-button-sm-hover)] active:[transform:var(--transform-button-active)]"
                >
                  <div
                    className="self-start font-mono text-micro uppercase px-1 border-2 border-border text-surface-page"
                    style={{ backgroundColor: color }}
                  >
                    {item.type}
                  </div>
                  <div className="font-bold text-sm text-content-primary line-clamp-2">
                    {item.title || item.content_preview || item.id.slice(0, 8)}
                  </div>
                  <div className="text-xs font-mono text-content-secondary line-clamp-3 leading-snug flex-1">
                    {item.content_preview}
                  </div>
                  <div className="font-mono text-micro text-content-muted">
                    {formatDate(item.created_at)}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 分页 */}
        {data && data.pages > 1 && (
          <div className="flex justify-center items-center gap-4 pt-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 border-2 border-border-default font-mono text-xs disabled:opacity-40 hover:border-accent"
            >
              {t('prev')}
            </button>
            <span className="font-mono text-xs text-content-secondary">
              {data.page} / {data.pages}
            </span>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 border-2 border-border-default font-mono text-xs disabled:opacity-40 hover:border-accent"
            >
              {t('next')}
            </button>
          </div>
        )}
      </div>

      {/* 详情弹窗（portal 到 body：脱离 AppLayout 层叠上下文，
          否则遮罩压不住 z=SIDEBAR 的侧边栏，展开时会被遮挡） */}
      {detail &&
        createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 md:p-10"
          style={{ zIndex: Z_INDEX.MODAL }}
          onClick={() => setDetail(null)}
        >
          <div
            className={`bg-surface-card border-2 border-border w-full h-full flex flex-col shadow-[8px_8px_0_0_var(--color-shadow)] transition-all duration-200 ${
              expanded ? 'max-w-[96vw] max-h-[94vh]' : 'max-w-4xl max-h-[85vh]'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border bg-surface-elevated">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-micro uppercase bg-content-primary text-surface-page px-1">
                  {detail.type}
                </span>
                <span className="font-bold text-sm text-content-primary truncate">
                  {detail.title || detail.id.slice(0, 8)}
                </span>
                {detailLoading && (
                  <span className="font-mono text-micro text-content-muted">
                    {t('loading')}...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleShare}
                disabled={isSharing}
                title={t('artifactShareAction')}
                className={cn(
                  'font-mono text-xs border-2 px-2 py-0.5 transition-colors disabled:opacity-50 flex items-center gap-1',
                  shareCopied
                    ? 'border-status-online text-status-online'
                    : 'border-border-default hover:bg-accent hover:border-accent'
                )}
              >
                <Share2 className="w-3 h-3" />
                <span>{shareCopied ? t('artifactShareCopied') : t('artifactShareAction')}</span>
              </button>
              <button
                onClick={() => setExpanded(v => !v)}
                title={expanded ? t('widthNarrow') : t('widthExpand')}
                className="font-mono text-xs border-2 border-border-default px-2 py-0.5 hover:bg-accent hover:border-accent"
              >
                {expanded ? <Shrink className="w-3 h-3" /> : <Expand className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setDetail(null)}
                className="font-mono text-xs border-2 border-border-default px-2 py-0.5 hover:bg-accent hover:border-accent"
              >
                {t('close')}
              </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden bg-surface-page">
              <ArtifactRenderer
                type={detail.type}
                language={detail.language}
                title={detail.title}
                content={detail.content || detail.content_preview || ''}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
