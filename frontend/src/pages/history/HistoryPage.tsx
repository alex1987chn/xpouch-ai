import { useEffect, useState, useCallback, useMemo } from 'react'
import { MessageSquare, Clock, Trash2, Search } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { getConversations, deleteConversation as apiDeleteConversation, type Conversation } from '@/services/api'
import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import SwipeBackIndicator from '@/components/agent/SwipeBackIndicator'
import { useApp } from '@/providers/AppProvider'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { logger } from '@/utils/logger'

interface HistoryPageProps {
  onSelectConversation: (conversation: Conversation) => void
}

export default function HistoryPage({ onSelectConversation }: HistoryPageProps) {
  const { t, language } = useTranslation()
  const { sidebar } = useApp()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const { swipeProgress, handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({ targetPath: '/' })

  // 删除确认状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [deletingConversationTitle, setDeletingConversationTitle] = useState('')

  const loadHistory = async () => {
    try {
      setLoading(true)
      const data = await getConversations()
      setConversations(data)
    } catch (error) {
      logger.error('Failed to load history:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  // 处理删除 - 打开确认对话框
  const handleDelete = useCallback((e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation()
    setDeletingConversationId(id)
    setDeletingConversationTitle(title || 'Unknown Conversation')
    setDeleteDialogOpen(true)
  }, [])

  // 确认删除操作
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingConversationId) return

    try {
      await apiDeleteConversation(deletingConversationId)
      // 从原始列表中移除，避免刷新导致滚动位置丢失
      setConversations(prev => prev.filter(conv => conv.id !== deletingConversationId))
      setDeleteDialogOpen(false)
    } catch (error) {
      logger.error('Failed to delete conversation:', error)
      setDeleteDialogOpen(false)
    }
  }, [deletingConversationId])

  const getLocale = () => {
    switch (language) {
      case 'zh': return zhCN
      case 'ja': return ja
      default: return enUS
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
      <header className="fixed top-0 left-0 right-0 z-40 h-[60px] px-6 border-b-2 border-[var(--border-color)] bg-[var(--bg-card)] transition-all duration-300" style={{
        paddingLeft: sidebar.isCollapsed ? '88px' : '320px'
      }}>
        <div className="w-full max-w-5xl mx-auto h-full flex items-center">
          {/* 左侧：标题 */}
          <div className="flex items-center h-full gap-3">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              ///
            </span>
            <h1 className="text-base font-black uppercase tracking-tight text-[var(--text-primary)]">
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
        {/* 移动端滑动返回指示器 */}
        <SwipeBackIndicator swipeProgress={swipeProgress} />

        {/* 搜索框 - Bauhaus风格 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4 mt-6">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder={t('searchHistory') || '搜索历史记录...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
            />
          </div>
        </div>

        {/* 数据统计信息 - Bauhaus风格 */}
        {!loading && filteredConversations.length > 0 && (
          <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
              <div className="w-1.5 h-1.5 bg-[var(--accent-hover)]"></div>
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
             <div className="text-center py-20 font-mono text-sm text-[var(--text-secondary)] uppercase">Loading...</div>
          ) : filteredConversations.length > 0 ? (
            <div className="space-y-2">
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation)}
                  className="group relative bg-[var(--bg-card)] border-2 border-[var(--border-color)] p-3 cursor-pointer shadow-[var(--shadow-color)_3px_3px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[var(--shadow-color)_5px_5px_0_0] transition-all"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-mono text-sm font-bold text-[var(--text-primary)] truncate">
                        {conversation.title || t('newChat')}
                      </h3>
                      <p className="font-mono text-xs text-[var(--text-secondary)] line-clamp-2 mt-1 mb-2">
                        {getLastMessagePreview(conversation)}
                      </p>

                      <div className="flex items-center gap-4 font-mono text-[10px] text-[var(--text-secondary)] uppercase">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(conversation.updated_at), {
                            addSuffix: true,
                            locale: getLocale()
                          })}
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
                        className="w-8 h-8 flex items-center justify-center border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors opacity-0 group-hover:opacity-100"
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
              <div className="w-16 h-16 mx-auto mb-4 border-2 border-[var(--border-color)] bg-[var(--bg-page)] flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-[var(--text-secondary)]" />
              </div>
              <h3 className="font-mono text-base font-bold text-[var(--text-primary)] uppercase mb-2">
                {searchQuery
                  ? t('noMatchingHistory') || 'No matching history'
                  : t('noHistory') || 'No conversation history'
                }
              </h3>
              <p className="font-mono text-xs text-[var(--text-secondary)] uppercase">
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

