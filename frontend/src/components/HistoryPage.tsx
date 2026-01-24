import { useEffect, useState, useCallback, useMemo } from 'react'
import { MessageSquare, Clock, Trash2, Search } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { getConversations, deleteConversation as apiDeleteConversation, type Conversation } from '@/services/api'
import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import SwipeBackIndicator from './SwipeBackIndicator'
import { useApp } from '@/providers/AppProvider'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface HistoryPageProps {
  onConversationClick: (id: string) => void
  onSelectConversation: (conversation: Conversation) => void // 强类型，API 返回的结构
}

export default function HistoryPage({ onConversationClick, onSelectConversation }: HistoryPageProps) {
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
      console.error('Failed to load history:', error)
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
      console.error('Failed to delete conversation:', error)
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
      {/* 极窄毛玻璃 Header - h-14 固定高度，fixed 定位 */}
      <header className="fixed top-0 left-0 right-0 z-40 h-14 px-6 lg:pl-[76px] backdrop-blur-xl bg-white/70 dark:bg-[#020617]/70 border-b border-slate-200/50 dark:border-slate-700/30 transition-all duration-300" style={{
        paddingLeft: sidebar.isCollapsed ? '12px' : '252px'
      }}>
        <div className="w-full max-w-5xl mx-auto h-full flex items-center">
          {/* 左侧：图标 + 标题 */}
          <div className="flex items-center h-full">
            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-base font-semibold text-slate-800 dark:text-slate-200 ml-3">
              {t('history')}
            </h1>
          </div>
        </div>
      </header>

      {/* 可滚动内容区 - 添加 pt-14 避免内容被 header 遮挡 */}
      <ScrollArea
        className="h-full overflow-x-hidden pt-14"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 移动端滑动返回指示器 */}
        <SwipeBackIndicator swipeProgress={swipeProgress} />

        {/* 搜索框 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-3 md:pb-3 mt-8">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <Input
              type="text"
              placeholder={t('searchHistory') || '搜索历史记录...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* 数据统计信息 */}
        {!loading && filteredConversations.length > 0 && (
          <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4 md:pb-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span>
                {searchQuery
                  ? `${filteredConversations.length} ${t('matchingHistory') || 'matching history'}`
                  : `${conversations.length} ${t('totalHistory') || 'total history'}`
                }
              </span>
            </div>
          </div>
        )}

        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-24 md:pb-20 mt-0">
          {loading ? (
             <div className="text-center py-20 text-gray-500">Loading history...</div>
          ) : filteredConversations.length > 0 ? (
            <div className="space-y-4">
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => {
                    onConversationClick(conversation.id)
                    // 传递给父组件，父组件可能会用这个对象更新状态
                    // 这里可能需要根据 useChatStore 的需求做转换
                    onSelectConversation(conversation)
                  }}
                  className="group relative bg-white dark:bg-slate-900/50 rounded-xl p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-l-2 hover:border-violet-500 transition-all cursor-pointer border border-slate-200 dark:border-slate-700/50 shadow-sm"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate mb-2">
                        {conversation.title || t('newChat')}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                        {getLastMessagePreview(conversation)}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(conversation.updated_at), {
                            addSuffix: true,
                            locale: getLocale()
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {getMessageCount(conversation)} messages
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDelete(e, conversation.id, conversation.title || '')}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                <MessageSquare className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {searchQuery
                  ? t('noMatchingHistory') || 'No matching history found'
                  : t('noHistory') || 'No conversation history'
                }
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery
                  ? t('tryOtherKeywords') || 'Try other keywords'
                  : t('startChat') || 'Start a new chat to see it here'
                }
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

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

