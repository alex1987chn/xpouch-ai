import { useState, useCallback, useMemo } from 'react'
import { MessageSquare, Clock, Trash2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { type Conversation } from '@/services/chat'
import { formatDistanceToNow, parseISO, isValid } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'
import { logger } from '@/utils/logger'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { useApp } from '@/providers/AppProvider'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { useChatHistoryQuery, useDeleteConversationMutation } from '@/hooks/queries'
import { useUserStore } from '@/store/userStore'

interface HistoryPageProps {
  onSelectConversation: (conversation: Conversation) => void
}

export default function HistoryPage({ onSelectConversation }: HistoryPageProps) {
  const { t, language } = useTranslation()
  const { sidebar } = useApp()
  const [searchQuery, setSearchQuery] = useState('')
  const { swipeProgress, handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({ targetPath: '/' })

  // 获取登录状态
  const isAuthenticated = useUserStore(state => state.isAuthenticated)

  // 使用 React Query 获取历史记录（只有登录后才发起请求）
  const { data: conversations = [], isLoading: loading } = useChatHistoryQuery({ enabled: isAuthenticated })

  // 使用 React Query Mutation 删除会话
  const deleteMutation = useDeleteConversationMutation()

  // 删除确认状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [deletingConversationTitle, setDeletingConversationTitle] = useState('')

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

      // 调试：打印时间差（强制输出，不受 DEBUG 开关影响）
      const diffMs = now.getTime() - date.getTime()
      const diffSec = Math.floor(diffMs / 1000)
      // eslint-disable-next-line no-console
      console.log('[HistoryPage Time Debug]', { dateString, diffMs, diffSec, now: now.toISOString(), date: date.toISOString() })

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
  const getLastMessagePreview = (conversation: Conversation) => {
    // 这里的逻辑可能需要根据后端实际返回的数据结构调整
    // 如果后端在列表接口里没有返回 messages 详情，可能需要后端调整 API 或这里只显示 title
    // 目前后端 Conversation 模型有 messages 关系，但不确定默认是否加载
    // 假设后端列表接口返回了 messages
    if (conversation.messages && conversation.messages.length > 0) {
        const lastMsg = conversation.messages[conversation.messages.length - 1]
        return lastMsg.content
    }
    return ''
  }

  // 辅助函数：计算消息数量
  const getMessageCount = (conversation: Conversation) => {
      return conversation.messages?.length || 0
  }

  // 过滤搜索结果
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      return conversations
    }
    const query = searchQuery.toLowerCase()
    return conversations.filter(conv => {
      // 搜索标题和最后一条消息
      const titleMatch = (conv.title || t('newChat')).toLowerCase().includes(query)
      const messageMatch = conv.messages && conv.messages.length > 0
        ? conv.messages[conv.messages.length - 1].content.toLowerCase().includes(query)
        : false
      return titleMatch || messageMatch
    })
  }, [conversations, searchQuery, t])



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
            <div className="w-2 h-2 bg-[rgb(var(--accent-hover))]"></div>
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
              className="w-full h-11 pl-10 pr-4 border-2 border-border-default bg-surface-page font-mono text-sm text-content-primary placeholder:text-content-secondary focus:outline-none focus:border-[rgb(var(--accent-hover))] transition-colors"
            />
          </div>
        </div>

        {/* 数据统计信息 - Bauhaus风格 */}
        {!loading && filteredConversations.length > 0 && (
          <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-content-secondary">
              <div className="w-1.5 h-1.5 bg-[rgb(var(--accent-hover))]"></div>
              <span>
                {searchQuery
                  ? `${filteredConversations.length} ${t('matchingHistory') || 'matching'}`
                  : `${conversations.length} ${t('totalHistory') || 'total items'}`
                }
              </span>
            </div>
          </div>
        )}

        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-24 md:pb-20">
          {loading ? (
             <div className="text-center py-20 font-mono text-sm text-content-secondary uppercase">Loading...</div>
          ) : filteredConversations.length > 0 ? (
            <div className="space-y-2">
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation)}
                  className="group relative bg-surface-card border-2 border-border-default p-3 cursor-pointer shadow-[rgb(var(--shadow-color))_3px_3px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[rgb(var(--shadow-color))_5px_5px_0_0] transition-all"
                >
                  <div className="flex justify-between items-start gap-4">
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

                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={(e) => handleDelete(e, conversation.id, conversation.title || '')}
                        className="w-8 h-8 flex items-center justify-center border border-border-default text-content-secondary hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
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

      {/* 删除确认对话框 */}
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
    </div>
  )
}

