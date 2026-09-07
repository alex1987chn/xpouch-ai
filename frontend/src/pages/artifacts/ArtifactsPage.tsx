/**
 * =============================
 * ArtifactsPage - 产物中心
 * =============================
 *
 * 跨会话浏览所有产物：类型过滤 + 分页 + 点击查看详情（完整渲染）。
 * 布局遵循内容页规范（max-w-5xl），标题习语照抄 LibraryPage。
 */

import { useState } from 'react'
import { useTranslation } from '@/i18n'
import { useArtifactsQuery } from '@/hooks/queries/useArtifactsQuery'
import { getArtifactDetail } from '@/services/artifacts'
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

      {/* 详情弹窗 */}
      {detail && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4 md:p-10"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-surface-card border-2 border-border w-full max-w-4xl h-full max-h-[85vh] flex flex-col shadow-[8px_8px_0_0_var(--color-shadow)]"
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
              <button
                onClick={() => setDetail(null)}
                className="font-mono text-xs border-2 border-border-default px-2 py-0.5 hover:bg-accent hover:border-accent"
              >
                {t('close')}
              </button>
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
        </div>
      )}
    </div>
  )
}
