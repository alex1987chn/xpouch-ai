/**
 * ArtifactCanvas - 工作台右栏「产物画布」
 *
 * [设计] 产物是当前会话的投影：本会话产物挂在对话旁并排对照（蓝本）。
 * 两个视图：产物（当前线程，useThreadArtifactsQuery）/ 画廊（跨会话，useArtifactsQuery）。
 * 点击产物 → 内联展开预览（getArtifactDetail 拉全文，ArtifactRenderer 渲染）。
 *
 * [复用] ArtifactRenderer / getArtifactDetail / shareArtifact / TYPE_COLORS 全部来自产物中心。
 */

import { useState, useCallback } from 'react'
import { useTranslation } from '@/i18n'
import { useQuery } from '@tanstack/react-query'
import { Share2 } from 'lucide-react'

import { useArtifactsQuery, useThreadArtifactsQuery, artifactsKeys } from '@/hooks/queries/useArtifactsQuery'
import { getArtifactDetail, shareArtifact } from '@/services/artifacts'
import ArtifactRenderer from '@/components/artifacts/ArtifactRenderer'
import { Skeleton } from '@/components/ui/skeleton'
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

export function ArtifactCanvas({ threadId }: ArtifactCanvasProps) {
  const { t, language } = useTranslation()
  const [tab, setTab] = useState<CanvasTab>('thread')
  const [detailId, setDetailId] = useState<string | null>(null)

  const threadQuery = useThreadArtifactsQuery(threadId)
  const galleryQuery = useArtifactsQuery(1)

  // 详情：按需拉全文（点击才请求，避免列表页拖全文）
  const detailQuery = useQuery({
    queryKey: ['artifactDetail', detailId],
    queryFn: () => getArtifactDetail(detailId!),
    enabled: !!detailId,
    staleTime: 60_000,
  })

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

  const locale = language === 'en' ? enUS : language === 'ja' ? ja : zhCN

  return (
    <aside className="hidden w-[330px] shrink-0 flex-col border-l border-border-divider bg-surface-card xl:flex">
      {/* 页签 */}
      <div className="flex gap-1 px-3 pt-3">
        {(['thread', 'gallery'] as const).map(key => (
          <button
            key={key}
            onClick={() => { setTab(key); setDetailId(null) }}
            className={cn(
              'rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
              tab === key
                ? 'bg-surface-elevated font-bold text-content-primary'
                : 'text-content-secondary hover:text-content-primary'
            )}
          >
            {key === 'thread' ? t('canvasArtifacts') : t('canvasGallery')}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div className="bauhaus-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {detailId ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setDetailId(null)}
              className="w-fit text-xs text-content-secondary hover:text-content-primary"
            >
              {t('backToList')}
            </button>
            {detailQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            ) : detailQuery.data ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-content-primary">
                    {detailQuery.data.title || detailQuery.data.type}
                  </span>
                  <button
                    onClick={() => handleShare(detailQuery.data!.id)}
                    title={t('artifactShareAction')}
                    className="flex h-6 w-6 items-center justify-center rounded-sm border-theme-button border-border-default text-content-secondary hover:border-border-focus hover:text-content-primary"
                  >
                    <Share2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="max-h-[calc(100dvh-220px)] overflow-y-auto rounded-sm border-theme-card border-border-default bg-surface-page p-2">
                  <ArtifactRenderer
                    type={detailQuery.data.type}
                    language={detailQuery.data.language}
                    title={detailQuery.data.title}
                    content={detailQuery.data.content || ''}
                  />
                </div>
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
          <p className="pt-8 text-center text-nano text-content-muted">
            {tab === 'thread' ? t('canvasEmpty') : t('canvasGalleryEmpty')}
          </p>
        ) : (
          <div className="space-y-2">
            {activeList.map(artifact => (
              <button
                key={artifact.id}
                onClick={() => setDetailId(artifact.id)}
                className="w-full rounded-md border border-border-divider bg-surface-card p-2.5 text-left transition-all hover:border-border-hover hover:shadow-theme-card"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent-info/12 px-2 py-0.5 text-nano font-medium text-accent-info">
                    {artifact.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-content-primary">
                    {artifact.title || artifact.type}
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
