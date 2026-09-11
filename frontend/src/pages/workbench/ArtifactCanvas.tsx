/**
 * ArtifactCanvas - 工作台右栏「产物画布」
 *
 * [设计] 产物是当前会话的投影：本会话产物挂在对话旁并排对照（蓝本）。
 * 两个视图：产物（当前线程）/ 画廊（跨会话）。点击产物 → 内联展开全文。
 * [画布两档宽度] 330px 紧凑 ↔ 560px 宽屏（对照代码/文档更从容）。
 * [详情动作] 分享 / 复制内容 / 下载文件 / HTML·图片新标签页预览。
 */

import { useState, useCallback } from 'react'
import { useTranslation } from '@/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Share2, Package, LayoutGrid, Download, Copy, ExternalLink, PanelRight, Check, ArrowLeft, Pencil } from 'lucide-react'

import { useArtifactsQuery, useThreadArtifactsQuery, artifactsKeys } from '@/hooks/queries/useArtifactsQuery'
import { getArtifactDetail, shareArtifact, updateArtifactContent } from '@/services/artifacts'
import ArtifactRenderer from '@/components/artifacts/ArtifactRenderer'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { pushToast } from '@/components/ui/use-toast'
import type { ArtifactListItem } from '@/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'

type CanvasTab = 'thread' | 'gallery'

interface ArtifactCanvasProps {
  threadId: string | null
}

function toLocalDate(iso: string): Date {
  const parsed = parseISO(iso)
  return new Date(parsed.getTime() + parsed.getTimezoneOffset() * 60_000)
}

/** 类型 → 识别色（与全站身份色板同族的低饱和色） */
const TYPE_COLOR: Record<string, string> = {
  code: '#6f93ad', sql: '#6f93ad', json: '#7aa5b5', chart: '#7aa5b5',
  html: '#b45f55', markdown: '#7d9b76', report: '#7d9b76', search: '#8b7ec8',
  image: '#a8556f', video: '#7aa5b5', media: '#7aa5b5', text: '#6f6a62',
}

/** 可编辑的文本型产物 */
const EDITABLE_TYPES = new Set(['markdown', 'text', 'code', 'html', 'report', 'sql', 'json'])

/** 类型标签 chip 样式 */
function typeChipStyle(type: string): React.CSSProperties {
  const color = TYPE_COLOR[type] || '#6f6a62'
  return { backgroundColor: `${color}1f`, color }
}

/** 类型 → 下载扩展名 */
const TYPE_EXT: Record<string, string> = {
  markdown: 'md', code: 'txt', html: 'html', text: 'txt',
  sql: 'sql', json: 'json', chart: 'json', report: 'md',
}

export function ArtifactCanvas({ threadId }: ArtifactCanvasProps) {
  const { t, language } = useTranslation()
  const [tab, setTab] = useState<CanvasTab>('thread')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [wide, setWide] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)

  const threadQuery = useThreadArtifactsQuery(threadId)
  const galleryQuery = useArtifactsQuery(1)

  // 详情：按需拉全文（点击才请求，避免列表页拖全文）
  const detailQuery = useQuery({
    queryKey: ['artifactDetail', detailId],
    queryFn: () => getArtifactDetail(detailId!),
    enabled: !!detailId,
    staleTime: 60_000,
  })
  const detail = detailQuery.data

  const activeList: ArtifactListItem[] =
    tab === 'thread' ? (threadQuery.data?.items ?? []) : (galleryQuery.data?.items ?? [])
  const isLoading = tab === 'thread' ? threadQuery.isLoading : galleryQuery.isLoading

  const handleShare = useCallback(
    async (artifactId: string) => {
      try {
        const { path } = await shareArtifact(artifactId)
        await navigator.clipboard.writeText(window.location.origin + path)
        pushToast({ title: t('artifactShareCopied') })
      } catch {
        pushToast({ title: t('saveFailed'), variant: 'destructive' })
      }
    },
    [t]
  )

  const handleCopy = async () => {
    if (!detail?.content) return
    try {
      await navigator.clipboard.writeText(detail.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      pushToast({ title: t('copyFailed') || 'Copy failed', variant: 'destructive' })
    }
  }

  const handleStartEdit = () => {
    if (!detail?.content) return
    setEditDraft(detail.content)
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!detail) return
    setIsSaving(true)
    try {
      await updateArtifactContent(detail.id, editDraft)
      pushToast({ title: t('saved') || 'Saved' })
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['artifactDetail', detailId] })
      queryClient.invalidateQueries({ queryKey: artifactsKeys.threadList(threadId || '') })
    } catch (error) {
      pushToast({ title: (error as Error).message || t('saveFailed'), variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownload = () => {
    if (!detail?.content) return
    const ext = TYPE_EXT[detail.type] || 'txt'
    const base = (detail.title || detail.type).replace(/[\\/:*?"<>|]/g, '_')
    const blob = new Blob([detail.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${base}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /** HTML 全文 / 图片链接 → 新标签页打开看全貌 */
  const handleOpenTab = () => {
    if (!detail) return
    const content = detail.content || ''
    if (detail.type === 'html') {
      const url = URL.createObjectURL(new Blob([content], { type: 'text/html' }))
      window.open(url, '_blank')
      // note: blob URL 随窗口存活，新标签关闭即失效
    } else if (/^https?:|^data:image/.test(content)) {
      window.open(content, '_blank')
    } else {
      handleDownload()
    }
  }

  const canOpenTab = !!detail && (detail.type === 'html' || /^https?:|^data:image/.test(detail.content || ''))

  const locale = language === 'en' ? enUS : language === 'ja' ? ja : zhCN

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-l border-border-divider bg-surface-card transition-[width] duration-200 xl:flex',
        wide ? 'w-[560px]' : 'w-[330px]'
      )}
    >
      {/* 页签 + 宽度切换 */}
      <div className="flex items-center gap-1 px-3 pt-3">
        {(['thread', 'gallery'] as const).map(key => (
          <button
            key={key}
            onClick={() => { setTab(key); setDetailId(null) }}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs transition-colors',
              tab === key
                ? 'bg-surface-tint font-bold text-content-primary'
                : 'font-medium text-content-secondary hover:text-content-primary'
            )}
          >
            {key === 'thread' ? t('canvasArtifacts') : t('canvasGallery')}
          </button>
        ))}
        <span className="flex-1" />
        <button
          onClick={() => setWide(w => !w)}
          title={wide ? t('canvasCompact') : t('canvasWide')}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            wide ? 'bg-surface-tint text-content-primary' : 'text-content-muted hover:bg-surface-tint/60 hover:text-content-primary'
          )}
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {detailId ? (
          <div className="flex flex-col gap-2">
            {detailQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            ) : detail ? (
              <div className="flex flex-col gap-2">
                {/* 标题 + 动作组 */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setDetailId(null); setEditing(false) }}
                    title={t('backToList')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-divider bg-surface-card text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </button>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-nano font-medium"
                    style={typeChipStyle(detail.type)}
                  >
                    {detail.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-content-primary">
                    {detail.title || (detail.content_preview ?? '').slice(0, 16) || detail.type}
                  </span>
                  {EDITABLE_TYPES.has(detail.type) && !editing && (
                    <button
                      onClick={handleStartEdit}
                      title={t('edit')}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={handleCopy}
                    title={t('copy')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary"
                  >
                    {copied ? <Check className="h-3 w-3 text-accent-success" /> : <Copy className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={handleDownload}
                    title={t('download')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                  {canOpenTab && (
                    <button
                      onClick={handleOpenTab}
                      title={t('preview')}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => handleShare(detail.id)}
                    title={t('artifactShareAction')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary"
                  >
                    <Share2 className="h-3 w-3" />
                  </button>
                </div>
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      className="min-h-[240px] flex-1 resize-y rounded-md border-theme-input border-border-default bg-surface-page p-3 font-mono text-xs leading-relaxed text-content-primary focus:border-border-focus focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditing(false)}
                        disabled={isSaving}
                        className="rounded-full border border-border-divider bg-surface-page px-4 py-1.5 text-xs font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        onClick={() => void handleSaveEdit()}
                        disabled={isSaving}
                        className="rounded-full border border-border-divider bg-accent-brand px-5 py-1.5 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                      >
                        {isSaving ? (t('saving') || 'Saving') : (t('save') || 'Save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[calc(100dvh-220px)] overflow-y-auto rounded-md border border-border-divider bg-surface-page p-2">
                    <ArtifactRenderer
                      type={detail.type}
                      language={detail.language}
                      title={detail.title}
                      content={detail.content || ''}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : activeList.length === 0 ? (
          <EmptyState
            variant="card"
            dense
            icon={tab === 'thread' ? Package : LayoutGrid}
            title={tab === 'thread' ? t('canvasEmpty') : t('canvasGalleryEmpty')}
            description={tab === 'thread' ? t('canvasEmptyHint') : t('canvasGalleryEmptyHint')}
          />
        ) : (
          <div className="space-y-2">
            {activeList.map(artifact => (
              <button
                key={artifact.id}
                onClick={() => setDetailId(artifact.id)}
                className="w-full rounded-md border border-border-divider bg-surface-card p-2.5 text-left transition-all hover:border-border-hover hover:shadow-theme-card"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-nano font-medium"
                    style={typeChipStyle(artifact.type)}
                  >
                    {artifact.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-content-primary">
                    {artifact.title || (artifact.content_preview ?? '').slice(0, 16) || artifact.type}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="truncate text-nano text-content-muted">
                    {(artifact.content_preview ?? '').slice(0, 60) || '—'}
                  </span>
                  <span className="shrink-0 text-nano text-content-muted">
                    {formatDistanceToNow(toLocalDate(artifact.created_at ?? ''), { addSuffix: false, locale })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

// 供工作台核心在消息完成后刷新本线程产物
export { artifactsKeys }
