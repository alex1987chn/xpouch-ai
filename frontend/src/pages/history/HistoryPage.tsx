import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { MessageSquare, Clock, Trash2, Search, Loader2, CheckSquare, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { type Conversation } from '@/services/chat'
import { formatDistanceToNow, parseISO, isValid } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'
import { logger } from '@/utils/logger'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { useApp } from '@/providers/AppProvider'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { useChatHistoryQuery, useDeleteConversationMutation, useBatchDeleteConversationsMutation } from '@/hooks/queries'
import { useUserStore } from '@/store/userStore'

interface HistoryPageProps {
  onSelectConversation: (conversation: Conversation) => void
}

export default function HistoryPage({ onSelectConversation }: HistoryPageProps) {
  const { t, language } = useTranslation()
  const { sidebar } = useApp()
  const [searchQuery, setSearchQuery] = useState('')
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({ targetPath: '/' })
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // 获取登录状态
  const isAuthenticated = useUserStore(state => state.isAuthenticated)

  // 使用 React Query Infinite Query 获取历史记录（分页加载）
  const {
    data,
    isLoading: loading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useChatHistoryQuery({ enabled: isAuthenticated, limit: 20 })

  // 合并所有页的数据
  const conversations = useMemo(() => {
    return data?.pages.flatMap(page => page.items) || []
  }, [data])

  // 使用 React Query Mutation 删除会话
  const deleteMutation = useDeleteConversationMutation()
  const batchDeleteMutation = useBatchDeleteConversationsMutation()

  // 删除确认状态（单个删除）
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [deletingConversationTitle, setDeletingConversationTitle] = useState('')

  // 批量删除状态
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)

  // 处理删除 - 打开确认对话框
  const handleDelete = useCallback((e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation()
    setDeletingConversationId(id)
    setDeletingConversationTitle(title || 'Unknown Conversation')
    setDeleteDialogOpen(true)
  }, [])

  // 确认删除操作 - 使用 React Query Mutation
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingConversationId) return

    try {
      await deleteMutation.mutateAsync(deletingConversationId)
      setDeleteDialogOpen(false)
    } catch (error) {
      logger.error('Failed to delete conversation:', error)
      setDeleteDialogOpen(false)
    }
  }, [deletingConversationId, deleteMutation])

  // ==================== 批量删除功能 ====================

  // 进入/退出批量模式
  const toggleBatchMode = useCallback(() => {
    setIsBatchMode(prev => !prev)
    setSelectedIds(new Set()) // 清除选择
  }, [])

  // 切换选中状态
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  // 打开批量删除确认对话框
  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return
    setBatchDeleteDialogOpen(true)
  }, [selectedIds.size])

  // 确认批量删除
  const handleConfirmBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return

    try {
      await batchDeleteMutation.mutateAsync(Array.from(selectedIds))
      setBatchDeleteDialogOpen(false)
      setSelectedIds(new Set())
      setIsBatchMode(false)
    } catch (error) {
      logger.error('Failed to batch delete conversations:', error)
      setBatchDeleteDialogOpen(false)
    }
  }, [selectedIds, batchDeleteMutation])

  // 取消批量模式
  const exitBatchMode = useCallback(() => {
    setIsBatchMode(false)
    setSelectedIds(new Set())
  }, [])

  const getLocale = () => {
    switch (language) {
      case 'zh': return zhCN
      case 'ja': return ja
      default: return enUS
    }
  }

  // 安全格式化相对时间
  const formatRelativeTime = (dateString: string | undefined): string => {
    if (!dateString) return '-'

    try {
      // 使用 parseISO 正确解析 ISO 8601 格式时间字符串
      const date = parseISO(dateString)
      const now = new Date()

      // 验证日期是否有效
      if (!isValid(date)) {
        logger.warn('Invalid date string:', dateString)
        return '-'
      }

      // 调试：打印时间差
      const diffMs = now.getTime() - date.getTime()
      const diffSec = Math.floor(diffMs / 1000)
      logger.debug('[HistoryPage Time Debug]', { dateString, diffMs, diffSec, now: now.toISOString(), date: date.toISOString() })

      // 处理未来时间（服务器时间比客户端快）
      if (diffMs < 0) {
        return t('justNow')
      }

      // 小于 1 秒显示"刚刚"而不是 "now"
      if (diffSec < 1) {
        return t('justNow')
      }

      // 小于 60 秒显示具体秒数
      if (diffSec < 60) {
        return `${diffSec} ${t('secondsAgo')}`
      }

      return formatDistanceToNow(date, {
        addSuffix: true,
        locale: getLocale()
      })
    } catch (error) {
      logger.warn('Failed to format date:', dateString, error)
      return '-'
    }
  }

  // 辅助函数：获取最后一条消息的内容摘要
  // P0-5 优化：使用后端返回的 last_message_preview 字段
  const getLastMessagePreview = (conversation: Conversation) => {
    return conversation.last_message_preview || ''
  }

  // 辅助函数：计算消息数量
  // P0-5 优化：使用后端返回的 message_count 字段
  const getMessageCount = (conversation: Conversation) => {
    return conversation.message_count || 0
  }

  // 滚动加载更多
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          logger.debug('[HistoryPage] 滚动到底部，加载更多')
          fetchNextPage()
        }
      },
      { root: container, threshold: 0.1 }
    )

    // 监听一个底部的占位元素
    const sentinel = document.getElementById('history-load-more-sentinel')
    if (sentinel) {
      observer.observe(sentinel)
    }

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // 过滤搜索结果（前端搜索已加载的数据）
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      return conversations
    }
    const query = searchQuery.toLowerCase()
    return conversations.filter(conv => {
      // 搜索标题和最后一条消息预览
      const titleMatch = (conv.title || t('newChat')).toLowerCase().includes(query)
      const previewMatch = (conv.last_message_preview || '').toLowerCase().includes(query)
      return titleMatch || previewMatch
    })
  }, [conversations, searchQuery, t])

  // 全选/取消全选（移到 filteredConversations 之后）
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredConversations.length && filteredConversations.length > 0) {
      // 已全选，取消全选
      setSelectedIds(new Set())
    } else {
      // 全选
      setSelectedIds(new Set(filteredConversations.map(c => c.id)))
    }
  }, [selectedIds.size, filteredConversations])



  return (
    <div className="bg-transparent overflow-x-hidden w-full h-full flex flex-col">
      {/* Bauhaus Header - 硬边风格 */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-40 h-[60px] px-6 border-b-2 border-border-default bg-surface-card transition-all duration-300",
          "lg:px-6",
          sidebar.isCollapsed ? "lg:pl-[88px]" : "lg:pl-[320px]"
        )}
      >
        <div className="w-full max-w-5xl mx-auto h-full flex items-center">
          {/* 左侧：标题 */}
          <div className="flex items-center h-full gap-3">
            <div className="w-2 h-2 bg-accent-hover"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              ///
            </span>
            <h1 className="text-base font-black uppercase tracking-tight text-content-primary">
              {t('history')}
            </h1>
          </div>
        </div>
      </header>

      {/* 可滚动内容区 - Bauhaus风格 */}
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto bauhaus-scrollbar overflow-x-hidden pt-[60px]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 搜索框 - Bauhaus风格 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4 mt-6">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-content-secondary" />
            <input
              type="text"
              placeholder={t('searchHistory') || '搜索历史记录...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 border-2 border-border-default bg-surface-page font-mono text-sm text-content-primary placeholder:text-content-secondary focus:outline-none focus:border-accent-hover transition-colors"
            />
          </div>
        </div>

        {/* 数据统计信息 / 批量操作栏 - Bauhaus风格 */}
        {!loading && filteredConversations.length > 0 && (
          <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4">
            {!isBatchMode ? (
              /* 普通模式：显示统计 + Select 按钮 */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-content-secondary">
                  <div className="w-1.5 h-1.5 bg-accent-hover"></div>
                  <span>
                    {searchQuery
                      ? `${filteredConversations.length} ${t('matchingHistory') || 'matching'}`
                      : `${conversations.length} / ${data?.pages[0]?.total || 0} ${t('totalHistory') || 'loaded'}`
                    }
                  </span>
                  {hasNextPage && !searchQuery && (
                    <span className="text-accent-hover">({t('moreAvailable') || 'more'})</span>
                  )}
                </div>
                
                {/* 进入批量模式按钮 */}
                <button
                  onClick={toggleBatchMode}
                  className="px-3 py-1.5 font-mono text-xs uppercase tracking-wider border-2 border-border-default text-content-secondary hover:border-accent-hover hover:text-accent-hover transition-colors"
                >
                  {t('select')}
                </button>
              </div>
            ) : (
              /* 批量模式：显示操作栏 */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* 全选/取消全选 */}
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-content-secondary hover:text-accent-hover transition-colors"
                  >
                    {selectedIds.size === filteredConversations.length && filteredConversations.length > 0 ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    <span>
                      {selectedIds.size === filteredConversations.length && filteredConversations.length > 0
                        ? t('deselectAll')
                        : t('selectAll')
                      }
                    </span>
                  </button>
                  
                  {/* 选中计数 */}
                  {selectedIds.size > 0 && (
                    <span className="font-mono text-xs text-accent-hover">
                      ({t('selectedCount', { count: selectedIds.size }) || `${selectedIds.size} selected`})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* 取消批量模式按钮 */}
                  <button
                    onClick={exitBatchMode}
                    className="px-3 py-1.5 font-mono text-xs uppercase tracking-wider border-2 border-border-default text-content-secondary hover:border-accent-hover hover:text-accent-hover transition-colors"
                  >
                    {t('cancel')}
                  </button>

                  {/* 批量删除按钮 */}
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider border-2 transition-colors",
                      selectedIds.size > 0
                        ? "border-accent-destructive text-accent-destructive hover:bg-accent-destructive hover:text-white"
                        : "border-border-default text-content-secondary cursor-not-allowed"
                    )}
                  >
                    {batchDeleteMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    <span>{t('delete')} ({selectedIds.size})</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-24 md:pb-20">
          {loading ? (
             <div className="text-center py-20 font-mono text-sm text-content-secondary uppercase">{t('loading')}</div>
          ) : filteredConversations.length > 0 ? (
            <div className="space-y-2">
              {filteredConversations.map((conversation) => {
                const isSelected = selectedIds.has(conversation.id)
                return (
                  <div
                    key={conversation.id}
                    onClick={() => {
                      if (isBatchMode) {
                        toggleSelection(conversation.id)
                      } else {
                        onSelectConversation(conversation)
                      }
                    }}
                    className={cn(
                      "group relative bg-surface-card border-2 p-3 transition-all",
                      isSelected
                        ? "border-accent-hover shadow-hard-3"
                        : "border-border-default shadow-hard-3 hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-hard-5 cursor-pointer"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* 批量模式：显示 Checkbox */}
                      {isBatchMode && (
                        <div 
                          className="flex-shrink-0 pt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => toggleSelection(conversation.id)}
                            className={cn(
                              "w-5 h-5 flex items-center justify-center border-2 transition-colors",
                              isSelected
                                ? "border-accent-hover bg-accent-hover text-white"
                                : "border-border-default hover:border-accent-hover"
                            )}
                          >
                            {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h3 className="font-mono text-sm font-bold text-content-primary truncate">
                          {conversation.title || t('newChat')}
                        </h3>
                        <p className="font-mono text-xs text-content-secondary line-clamp-2 mt-1 mb-2">
                          {getLastMessagePreview(conversation)}
                        </p>

                        <div className="flex items-center gap-4 font-mono text-[10px] text-content-secondary uppercase">
                          <span className="flex items-center gap-1" title={conversation.updated_at || '-'}>
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(conversation.updated_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {getMessageCount(conversation)} msgs
                          </span>
                        </div>
                      </div>

                      {/* 普通模式：显示删除按钮 */}
                      {!isBatchMode && (
                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={(e) => handleDelete(e, conversation.id, conversation.title || '')}
                            className="w-8 h-8 flex items-center justify-center border border-border-default text-content-secondary hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete conversation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              
              {/* 加载更多指示器 */}
              <div id="history-load-more-sentinel" className="py-4 flex justify-center">
                {isFetchingNextPage ? (
                  <div className="flex items-center gap-2 font-mono text-xs text-content-secondary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('loading')}</span>
                  </div>
                ) : hasNextPage ? (
                  <div className="font-mono text-xs text-content-secondary">
                    {t('loadMore')}
                  </div>
                ) : conversations.length > 0 ? (
                  <div className="font-mono text-xs text-content-secondary">
                    {t('noMoreRecords')}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 border-2 border-border-default bg-surface-page flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-content-secondary" />
              </div>
              <h3 className="font-mono text-base font-bold text-content-primary uppercase mb-2">
                {searchQuery
                  ? t('noMatchingHistory') || 'No matching history'
                  : t('noHistory') || 'No conversation history'
                }
              </h3>
              <p className="font-mono text-xs text-content-secondary uppercase">
                {searchQuery
                  ? t('tryOtherKeywords') || 'Try other keywords'
                  : t('startChat') || 'Start a new chat to see it here'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 单个删除确认对话框 */}
      <DeleteConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false)
          setDeletingConversationId(null)
          setDeletingConversationTitle('')
        }}
        onConfirm={handleConfirmDelete}
        title={t('confirmDeleteTitle')}
        description={t('confirmDeleteDescription')}
        itemName={deletingConversationTitle}
      />

      {/* 批量删除确认对话框 */}
      <DeleteConfirmDialog
        isOpen={batchDeleteDialogOpen}
        onClose={() => setBatchDeleteDialogOpen(false)}
        onConfirm={handleConfirmBatchDelete}
        title={t('batchDelete')}
        description={t('batchDeleteConfirm', { count: selectedIds.size })}
        itemName={t('selectedCount', { count: selectedIds.size })}
      />
    </div>
  )
}

