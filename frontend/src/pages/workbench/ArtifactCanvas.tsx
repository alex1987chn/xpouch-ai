/**
 * ArtifactCanvas - 工作台右栏「产物画布」
 *
 * [设计] 产物是当前会话的投影：本会话产物挂在对话旁并排对照（蓝本）。
 * 两个视图：产物（当前线程）/ 画廊（跨会话）。
 * [卡片形态] 与专家卡同族的竖排卡片（类型色块 + 标题 + 预览 + 元信息），
 * 点击打开 ArtifactViewerModal 大框完成阅读/编辑/导出（侧栏只负责发现）。
 * [画布两档宽度] 330px 紧凑 ↔ 560px 宽屏。
 */

import { useState } from 'react'
import { useTranslation } from '@/i18n'
import { Package, LayoutGrid, PanelRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { useArtifactsQuery, useThreadArtifactsQuery } from '@/hooks/queries/useArtifactsQuery'
import { ArtifactViewerModal } from '@/components/artifacts/ArtifactViewerModal'
import { artifactTypeChipStyle, artifactTypeIcon } from '@/lib/artifactPresentation'
import { toLocalDate, localeForLanguage } from '@/lib/datetime'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import type { ArtifactListItem } from '@/types'
import { cn } from '@/lib/utils'

type CanvasTab = 'thread' | 'gallery'

interface ArtifactCanvasProps {
  threadId: string | null
}

export function ArtifactCanvas({ threadId }: ArtifactCanvasProps) {
  const { t, language } = useTranslation()
  const [tab, setTab] = useState<CanvasTab>('thread')
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [wide, setWide] = useState(false)

  const threadQuery = useThreadArtifactsQuery(threadId)
  const galleryQuery = useArtifactsQuery(1)

  const activeList: ArtifactListItem[] =
    tab === 'thread' ? (threadQuery.data?.items ?? []) : (galleryQuery.data?.items ?? [])
  const isLoading = tab === 'thread' ? threadQuery.isLoading : galleryQuery.isLoading

  const locale = localeForLanguage(language)

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
            onClick={() => setTab(key)}
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

      {/* 卡片栅格 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
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
          <div className="grid grid-cols-2 gap-2">
            {activeList.map(artifact => {
              const Icon = artifactTypeIcon(artifact.type)
              const title = artifact.title || (artifact.content_preview ?? '').slice(0, 20) || artifact.type
              return (
                <button
                  key={artifact.id}
                  onClick={() => setViewerId(artifact.id)}
                  className="flex flex-col gap-2 rounded-lg border border-border-divider bg-surface-card p-3 text-left transition-all hover:-translate-y-px hover:border-border-hover hover:shadow-theme-card"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-md"
                    style={artifactTypeChipStyle(artifact.type)}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="line-clamp-2 text-xs font-bold leading-snug text-content-primary">
                    {title}
                  </span>
                  {(artifact.content_preview ?? '') && (
                    <span className="line-clamp-2 text-nano leading-relaxed text-content-muted">
                      {artifact.content_preview}
                    </span>
                  )}
                  <span className="mt-auto flex items-center justify-between pt-0.5 text-nano text-content-muted">
                    <span>{artifact.type}</span>
                    <span>
                      {formatDistanceToNow(toLocalDate(artifact.created_at ?? ''), { addSuffix: false, locale })}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <ArtifactViewerModal
        artifactId={viewerId}
        onClose={() => setViewerId(null)}
        threadId={threadId}
      />
    </aside>
  )
}
