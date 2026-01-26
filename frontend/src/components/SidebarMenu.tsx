import { useState, useEffect } from 'react'
import { Home, History, FileText, Plus, MessageSquare } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getConversations, type Conversation } from '@/services/api'
import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'
import { logger } from '@/utils/logger'

interface SidebarMenuProps {
  isCollapsed?: boolean
  onCreateAgent?: () => void
}

export default function SidebarMenu({ isCollapsed = false, onCreateAgent }: SidebarMenuProps) {
  const { t, language } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([])

  // 判断当前页面
  const isOnHome = location.pathname === '/'
  const isOnKnowledge = location.pathname === '/knowledge'
  const isOnHistory = location.pathname === '/history'

  // 获取最近5条历史会话
  useEffect(() => {
    const loadRecentConversations = async () => {
      try {
        const conversations = await getConversations()
        // 按更新时间降序排列，取前5条
        const sorted = [...conversations]
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 5)
        setRecentConversations(sorted)
      } catch (error) {
        logger.error('Failed to load recent conversations:', error)
      }
    }

    // 只有在组件挂载后才加载
    loadRecentConversations()
  }, [])

  // 处理菜单项点击
  const handleMenuClick = (path: string) => {
    navigate(path)
  }

  // 处理会话点击
  const handleConversationClick = (conversationId: string) => {
    navigate(`/chat/${conversationId}`)
  }

  const getLocale = () => {
    const lang = language || 'en'
    switch (lang) {
      case 'zh': return zhCN
      case 'ja': return ja
      default: return enUS
    }
  }

  return (
    <div className={cn("flex flex-col h-full", isCollapsed ? "w-[72px]" : "w-full")}>
      {/* 创建智能体按钮 */}
      <div className={cn("pb-4", !isCollapsed && "px-3")}>
        {isCollapsed ? (
          <div className="flex justify-center">
            <Button
              onClick={onCreateAgent}
              variant="outline"
              size="icon"
              className="w-9 h-9 rounded-full bg-indigo-100 border-indigo-300 hover:bg-indigo-500 hover:border-indigo-500 transition-all"
              title={t('createAgent')}
            >
              <Plus className="w-4 h-4 text-indigo-600 hover:text-white transition-colors" />
            </Button>
          </div>
        ) : (
          <Button
            onClick={onCreateAgent}
            className="w-full h-9 rounded-lg bg-indigo-100 hover:bg-indigo-500 text-indigo-700 hover:text-white font-medium transition-all px-2 border border-indigo-200 hover:border-indigo-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('createAgent')}
          </Button>
        )}
      </div>

      {/* 菜单区域 - 根据收拢状态使用不同容器 */}
      {isCollapsed ? (
        <div className="flex-1 flex flex-col">
          {/* 主菜单 - 首页、知识库、历史记录 */}
          <div className="flex flex-col items-center space-y-2">
            {/* 首页按钮 */}
            <Button
              onClick={() => handleMenuClick('/')}
              variant={isOnHome ? 'secondary' : 'ghost'}
              className={cn(
                'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full',
                isOnHome
                  ? 'bg-white text-indigo-600 dark:bg-gray-700 dark:text-white'
                  : 'text-slate-400 hover:bg-gray-200/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
              )}
            >
              <Home className="w-4 h-4 flex-shrink-0" />
            </Button>

            {/* 知识库按钮 */}
            <Button
              onClick={() => handleMenuClick('/knowledge')}
              variant={isOnKnowledge ? 'secondary' : 'ghost'}
              className={cn(
                'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full',
                isOnKnowledge
                  ? 'bg-white text-indigo-600 dark:bg-gray-700 dark:text-white'
                  : 'text-slate-400 hover:bg-gray-200/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
              )}
            >
              <FileText className="w-4 h-4 flex-shrink-0" />
            </Button>

            {/* 历史记录按钮 */}
            <Button
              onClick={() => handleMenuClick('/history')}
              variant={isOnHistory ? 'secondary' : 'ghost'}
              className={cn(
                'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full',
                isOnHistory
                  ? 'bg-white text-indigo-600 dark:bg-gray-700 dark:text-white'
                  : 'text-slate-400 hover:bg-gray-200/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
              )}
            >
              <History className="w-4 h-4 flex-shrink-0" />
            </Button>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 px-3">
          {/* 主菜单 - 首页、知识库、历史记录 */}
          <div className="space-y-2">
          {/* 首页按钮 */}
          <Button
            onClick={() => handleMenuClick('/')}
            variant={isOnHome ? 'secondary' : 'ghost'}
            className={cn(
              'h-9 transition-all duration-200 justify-center py-0',
              isCollapsed
                ? 'w-8 mx-auto px-0'
                : 'w-full justify-start px-3',
              isOnHome
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-600/80 dark:text-white shadow-lg shadow-indigo-500/20'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            <Home className={cn('flex-shrink-0', isCollapsed ? 'w-4 h-4' : 'w-5 h-5')} />
            {!isCollapsed && <span className="ml-3 text-sm font-medium">{t('home')}</span>}
          </Button>

          {/* 知识库按钮 */}
          <Button
            onClick={() => handleMenuClick('/knowledge')}
            variant={isOnKnowledge ? 'secondary' : 'ghost'}
            className={cn(
              'h-9 transition-all duration-200 justify-center py-0',
              isCollapsed
                ? 'w-8 mx-auto px-0'
                : 'w-full justify-start px-3',
              isOnKnowledge
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-600/80 dark:text-white shadow-lg shadow-indigo-500/20'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            <FileText className={cn('flex-shrink-0', isCollapsed ? 'w-4 h-4' : 'w-5 h-5')} />
            {!isCollapsed && <span className="ml-3 text-sm font-medium">{t('knowledgeBase')}</span>}
          </Button>

          {/* 历史记录按钮 */}
          <Button
            onClick={() => handleMenuClick('/history')}
            variant={isOnHistory ? 'secondary' : 'ghost'}
            className={cn(
              'h-9 transition-all duration-200 justify-center py-0',
              isCollapsed
                ? 'w-8 mx-auto px-0'
                : 'w-full justify-start px-3',
              isOnHistory
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-600/80 dark:text-white shadow-lg shadow-indigo-500/20'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            <History className={cn('flex-shrink-0', isCollapsed ? 'w-4 h-4' : 'w-5 h-5')} />
            {!isCollapsed && <span className="ml-3 text-sm font-medium">{t('history')}</span>}
          </Button>
        </div>

        {/* 最近会话列表 - 仅在展开状态显示 */}
        {!isCollapsed && recentConversations.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="px-1 py-2">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t('recentChats') || '最近会话'}
              </h3>
            </div>
            <div className="space-y-1">
              {recentConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => handleConversationClick(conversation.id)}
                  className="w-full h-auto px-3 py-2 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                        title={conversation.title || t('newChat')}
                      >
                        {(conversation.title || t('newChat')).substring(0, 10)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
      )}
    </div>
  )
}

