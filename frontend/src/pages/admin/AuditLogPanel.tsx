/**
 * AuditLogPanel - 审计日志（管理台页签）
 *
 * 管理面关键变更留痕的查询视图：谁（操作者）在何时做了什么（动作/对象）。
 * 搜索匹配操作者 / 动作 / 对象；时间倒序。
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ScrollText, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { toLocalDate } from '@/lib/datetime'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { getAuditLogs } from '@/services/admin'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

const ACTION_LABELS: Record<string, string> = {
  'user.create': '用户管理 · 创建',
  'user.update': '用户管理 · 编辑',
  'user.delete': '用户管理 · 删除',
  'user.reset_password': '用户管理 · 重置密码',
  'expert.create': '专家 · 创建',
  'expert.update': '专家 · 更新',
  'expert.delete': '专家 · 删除',
  'quota.update': '配额 · 调整',
  'concurrency.update': '系统 · 并发上限调整',
  'plan.approve': '计划 · 批准',
  'plan.revise': '计划 · 修订',
  'plan.terminate': '计划 · 终止',
}

export default function AuditLogPanel({ searchQuery }: { searchQuery: string }) {
  const { t } = useTranslation()
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(1)

  // 换搜索词回第 1 页：旧关键词的页码在新结果上没有意义
  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  const query = useQuery({
    queryKey: ['audit-logs', searchQuery, page, refreshKey],
    queryFn: () =>
      getAuditLogs({ search: searchQuery, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // 翻页瞬间保留旧页内容（配 isFetching 转圈），不闪骨架屏
    placeholderData: prev => prev,
  })
  const entries = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-content-secondary">
          <ScrollText className="h-3.5 w-3.5" />
          {t('auditCount', { count: total })}
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
              icon={ScrollText}
              title={t('auditEmpty')}
              description={t('tryOtherKeywords')}
            />
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-divider">
                {(['auditColTime', 'auditColActor', 'auditColAction', 'auditColTarget'] as const).map(key => (
                  <th key={key} className="px-4 py-2.5 text-nano font-bold text-content-muted">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr
                  key={entry.id}
                  className="border-t border-border-divider transition-colors first:border-t-0 hover:bg-surface-tint/40"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-nano text-content-muted">
                    {entry.created_at ? format(toLocalDate(entry.created_at), 'MM-dd HH:mm:ss') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-bold text-content-primary">
                    {entry.actor_username}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-content-secondary">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 font-mono text-nano text-content-secondary">
                    {entry.target ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 翻页条（右下角）：auditCount 在顶部说总数，这里只管翻页 */}
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
