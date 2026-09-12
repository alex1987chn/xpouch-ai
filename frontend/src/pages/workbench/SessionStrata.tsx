/**
 * SessionStrata - 工作台左栏「会话地层」
 *
 * [设计] 历史不是独立页面，是工作台左侧可搜索的地层（docs/design 蓝本）。
 * 按日期分组（今天/昨天/本周/更早）；行内信息 = 专家识别色点 + 标题 + 状态 chip。
 * 状态语义：待裁决（琥珀）≠ 运行中（鼠尾草绿）≠ 静默（相对时间）。
 *
 * [数据] useChatHistoryQuery（与 HistoryPage 同一真相源）；
 * 搜索为已加载数据的前端过滤（沿用 HistoryPage 惯例，量级 <100 无需服务端搜索）。
 */

import { useMemo, useRef, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { formatDistanceToNow } from 'date-fns'
import { Plus, Trash2, MessagesSquare, SearchX } from 'lucide-react'

import { useChatHistoryQuery, chatHistoryKeys } from '@/hooks/queries/useChatHistoryQuery'
import { deleteConversation } from '@/services/chat'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { pushToast } from '@/components/ui/use-toast'
import { SearchInput } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import type { Conversation } from '@/types'
import { agentDotStyle, expertDisplayName } from '@/lib/expertIdentity'
import { toLocalDate, localeForLanguage, type Locale } from '@/lib/datetime'
import { cn } from '@/lib/utils'

interface SessionStrataProps {
  activeThreadId: string | null
  onNewChat: () => void
}

type StrataGroup = 'today' | 'yesterday' | 'thisWeek' | 'earlier'

function groupOf(iso: string): StrataGroup {
  const d = toLocalDate(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayMs = 86_400_000
  if (d >= startOfToday) return 'today'
  if (d >= new Date(startOfToday.getTime() - dayMs)) return 'yesterday'
  if (d >= new Date(startOfToday.getTime() - 6 * dayMs)) return 'thisWeek'
  return 'earlier'
}

/** 会话行的右侧槽：活动态显示状态 chip，静默态显示相对时间 */
function RowTrailing({ conversation, locale }: { conversation: Conversation; locale: Locale }) {
  const { t } = useTranslation()
  const status = conversation.latest_run?.status
  if (status === 'waiting_for_approval') {
    return (
      <span className="shrink-0 rounded-full bg-accent-warning/12 px-1.5 py-0.5 text-nano font-medium text-accent-warning">
        {t('chipAwaiting')}
      </span>
    )
  }
  if (status && ['running', 'queued', 'resuming'].includes(status)) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-status-online/12 px-1.5 py-0.5 text-nano font-medium text-status-online">
        <span className="h-1 w-1 animate-pulse rounded-full bg-status-online" />
        {t('chipRunning')}
      </span>
    )
  }
  return (
    <span className="shrink-0 text-nano text-content-muted">
      {formatDistanceToNow(toLocalDate(conversation.updated_at), { addSuffix: false, locale })}
    </span>
  )
}

export function SessionStrata({ activeThreadId, onNewChat }: SessionStrataProps) {
  const { t, language } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data, isLoading, fetchNextPage, hasNextPage } = useChatHistoryQuery({ limit: 20 })
  const conversations = useMemo(
    () => data?.pages.flatMap(page => page.items) ?? [],
    [data]
  )

  // 搜索：前端过滤已加载数据（标题 + 最后消息预览，沿用 HistoryPage 语义）
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(
      c =>
        c.title?.toLowerCase().includes(q) ||
        c.last_message_preview?.toLowerCase().includes(q)
    )
  }, [conversations, search])

  // 日期分组（保持列表原顺序，分组只是展示切面）
  const groups = useMemo(() => {
    const buckets: Record<StrataGroup, Conversation[]> = { today: [], yesterday: [], thisWeek: [], earlier: [] }
    for (const c of filtered) buckets[groupOf(c.updated_at)].push(c)
    return buckets
  }, [filtered])

  const locale = localeForLanguage(language)

  // 加载更多：滚动到底触发（IntersectionObserver，沿用 HistoryPage 模式）
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) void fetchNextPage()
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage])

  // 删除会话：确认后调接口，刷新地层；删的是当前线程则回到新会话
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    try {
      await deleteConversation(pendingDelete.id)
      pushToast({ title: t('sessionDeleted') })
      if (pendingDelete.id === activeThreadId) {
        useChatStore.getState().setMessages([])
        useChatStore.getState().setCurrentConversationId(null)
        useTaskStore.getState().resetAll(true)
        navigate('/workbench')
      }
      queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
    } catch (error) {
      pushToast({ title: (error as Error).message || t('deleteFailed'), variant: 'destructive' })
    } finally {
      setIsDeleting(false)
      setPendingDelete(null)
    }
  }

  // 切换会话：清空聊天态再换线程（与 HistoryPageWrapper 同一守卫序列）
  const handleSelect = (conversation: Conversation) => {
    if (conversation.id === activeThreadId) return
    useChatStore.getState().setMessages([])
    useChatStore.getState().setCurrentConversationId(null)
    useTaskStore.getState().resetAll(true)
    navigate(`/workbench/${conversation.id}`)
  }

  const groupLabels: Array<[StrataGroup, string] | null> = [
    groups.today.length ? ([ 'today', t('groupToday') ] as const) : null,
    groups.yesterday.length ? (['yesterday', t('groupYesterday')] as const) : null,
    groups.thisWeek.length ? (['thisWeek', t('groupThisWeek')] as const) : null,
    groups.earlier.length ? (['earlier', t('groupEarlier')] as const) : null,
  ]

  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border-divider bg-surface-card lg:flex">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="text-xs font-bold text-content-secondary">
          {t('strataTitle')}
        </span>
        <button
          onClick={onNewChat}
          title={t('newChat')}
          className="flex h-6 w-6 items-center justify-center rounded-sm border-theme-button border-border-default bg-surface-page text-content-secondary transition-all hover:border-border-focus hover:text-content-primary"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 搜索（统一组件 compact 变体） */}
      <div className="px-3 pb-2.5 pt-1.5">
        <SearchInput
          size="compact"
          value={search}
          onChange={setSearch}
          placeholder={t('strataSearch')}
        />
      </div>

      {/* 地层列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <div className="space-y-2 px-1 pt-1">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-sm bg-content-muted/10" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            variant="bare"
            dense
            icon={MessagesSquare}
            title={t('strataEmpty')}
            description={t('strataEmptyHint')}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="bare"
            dense
            icon={SearchX}
            title={t('noMatchingHistory')}
            description={t('tryOtherKeywords')}
          />
        ) : (
          groupLabels.map(group =>
            group ? (
              <div key={group[0]} className="mb-1">
                <div className="px-2 pb-1 pt-3 text-nano font-bold text-content-muted">
                  {group[1]}
                </div>
                {groups[group[0]].map(conv => {
                  const dot = agentDotStyle(conv.agent_id)
                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelect(conv)}
                      className={cn(
                        'group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors',
                        conv.id === activeThreadId
                          ? 'bg-surface-tint'
                          : 'hover:bg-surface-tint/60'
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          !dot && 'bg-content-muted/40'
                        )}
                        style={dot ?? undefined}
                        title={expertDisplayName(conv.agent_id)}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-content-secondary group-hover:text-content-primary">
                        {conv.title || t('newChat')}
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setPendingDelete(conv)
                        }}
                        aria-label={t('delete')}
                        title={t('delete')}
                        className="shrink-0 p-0.5 text-content-muted opacity-0 transition-opacity hover:text-accent-destructive focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <RowTrailing conversation={conv} locale={locale} />
                    </button>
                  )
                })}
              </div>
            ) : null
          )
        )}
        {/* 加载更多哨兵 */}
        {hasNextPage && <div ref={sentinelRef} className="h-6" />}

        {/* 删除确认 */}
        <DeleteConfirmDialog
          isOpen={!!pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={handleConfirmDelete}
          title={t('confirmDeleteConversation') || '删除会话'}
          description={(t('deleteConversationWarning') || '会话及其消息、运行记录将一并删除，此操作不可恢复。')}
          itemName={pendingDelete?.title || t('newChat')}
          confirmText={t('delete')}
          isDeleting={isDeleting}
        />
      </div>
    </aside>
  )
}
