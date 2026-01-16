import { useEffect, useState } from 'react'
import { MessageSquare, Clock, ArrowRight, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { getConversations, deleteConversation as apiDeleteConversation, type Conversation } from '@/services/api'
import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'

interface HistoryPageProps {
  onConversationClick: (id: string) => void
  onSelectConversation: (conversation: any) => void // 弱化类型，因为现在使用 API 返回的结构
}

export default function HistoryPage({ onConversationClick, onSelectConversation }: HistoryPageProps) {
  const { t, language } = useTranslation()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm(t('confirmDelete' as any) || 'Are you sure you want to delete this conversation?')) {
      try {
        await apiDeleteConversation(id)
        loadHistory()
      } catch (error) {
        console.error('Failed to delete conversation:', error)
        alert('Failed to delete conversation')
      }
    }
  }

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

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900/50">
      {/* Header */}
      <header className="shrink-0 h-16 border-b border-gray-200 dark:border-gray-800 flex items-center px-6 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('history')}
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
             <div className="text-center py-20 text-gray-500">Loading history...</div>
          ) : conversations.length > 0 ? (
            <div className="grid gap-4">
              {conversations.map((conversation) => (
                <div 
                  key={conversation.id}
                  onClick={() => {
                    onConversationClick(conversation.id)
                    // 传递给父组件，父组件可能会用这个对象更新状态
                    // 这里可能需要根据 useChatStore 的需求做转换
                    onSelectConversation(conversation)
                  }}
                  className="group relative bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-medium text-gray-900 dark:text-white truncate mb-1">
                        {conversation.title || t('newChat')}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                        {getLastMessagePreview(conversation)}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
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
                          onClick={(e) => handleDelete(e, conversation.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
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
                {t('noHistory' as any) || 'No conversation history'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {t('startChat' as any) || 'Start a new chat to see it here'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
