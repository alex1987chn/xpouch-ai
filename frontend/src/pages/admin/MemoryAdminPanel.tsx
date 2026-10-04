/**
 * MemoryAdminPanel - 用户长期记忆（管理台页签）
 *
 * 查看与逐条清理实例内积累的长期记忆（user_memories）。刻意不提供批量删/
 * 按用户清空：记忆属终端用户数据、误删不可再生，逐条删是刻意的摩擦。
 */

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Brain, RefreshCw, ChevronLeft, ChevronRight, Trash2, X, Check } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { toLocalDate } from '@/lib/datetime'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { pushToast } from '@/components/ui/use-toast'
import { getUserMemories, deleteUserMemory } from '@/services/admin'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

export default function MemoryAdminPanel({ searchQuery }: { searchQuery: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(1)
  const [armedId, setArmedId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  const query = useQuery({
    queryKey: ['admin-memories', searchQuery, page, refreshKey],
    queryFn: () =>
      getUserMemories({ query: searchQuery, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    placeholderData: prev => prev,
  })
  const entries = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await deleteUserMemory(id)
      setArmedId(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-memories'] })
    } catch {
      pushToast({ title: t('deleteFailed'), variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-content-secondary">
          <Brain className="h-3.5 w-3.5" />
          {t('memoryCount', { count: total })}
        </span>
        <span className="flex-1" />
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={query.isFetching}
          title={t('refresh')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-divider bg-surface-card">
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-4">
            <EmptyState
              variant="bare"
              dense
              icon={Brain}
              title={t('memoryEmpty')}
              description={t('tryOtherKeywords')}
            />
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-divider">
                {(
                  [
                    'memoryColTime',
                    'memoryColUser',
                    'memoryColContent',
                    'memoryColType',
                    '',
                  ] as const
                ).map((key, i) => (
                  <th key={i} className="px-4 py-2.5 text-nano font-bold text-content-muted">
                    {key ? t(key) : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(memory => (
                <tr
                  key={memory.id}
                  className="border-t border-border-divider transition-colors first:border-t-0 hover:bg-surface-tint/40"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-nano text-content-muted">
                    {memory.created_at ? format(toLocalDate(memory.created_at), 'MM-dd HH:mm') : '—'}
                  </td>
                  <td className="max-w-[140px] truncate px-4 py-2.5 font-mono text-nano text-content-secondary">
                    {memory.user_id}
                  </td>
                  <td className="max-w-[420px] truncate px-4 py-2.5 text-xs text-content-primary">
                    {memory.content}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-nano text-content-muted">
                    {memory.memory_type === 'fact' ? '—' : memory.memory_type}
                  </td>
                  <td className="px-4 py-2.5">
                    {armedId === memory.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(memory.id)}
                          disabled={deleting}
                          title={t('confirmDelete')}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-status-offline transition-colors hover:bg-status-offline/10 disabled:opacity-40"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setArmedId(null)}
                          title={t('cancel')}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setArmedId(memory.id)}
                        title={t('delete')}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-status-offline transition-colors hover:bg-status-offline/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!query.isLoading && pages > 1 && (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || query.isFetching}
            title={t('prev')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-nano tabular-nums text-content-secondary">
            {t('pageIndicator', { page, total: pages })}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page >= pages || query.isFetching}
            title={t('next')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
