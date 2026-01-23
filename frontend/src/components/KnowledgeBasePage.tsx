import { useState, useCallback } from 'react'
import { Plus, FileText, Trash2, Upload, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import SwipeBackIndicator from './SwipeBackIndicator'
import { useApp } from '@/providers/AppProvider'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'

// 知识库类型
interface KnowledgeItem {
  id: string
  name: string
  type: 'document' | 'folder'
  size?: string
  createdAt: string
  documentCount?: number
}

// 模拟知识库数据
const mockKnowledgeItems: KnowledgeItem[] = [
  {
    id: '1',
    name: '产品文档',
    type: 'folder',
    createdAt: '2026-01-15',
    documentCount: 12
  },
  {
    id: '2',
    name: '技术架构',
    type: 'folder',
    createdAt: '2026-01-14',
    documentCount: 8
  },
  {
    id: '3',
    name: 'API 文档.pdf',
    type: 'document',
    size: '2.3 MB',
    createdAt: '2026-01-13'
  },
  {
    id: '4',
    name: '用户指南.md',
    type: 'document',
    size: '156 KB',
    createdAt: '2026-01-12'
  },
  {
    id: '5',
    name: '常见问题',
    type: 'folder',
    createdAt: '2026-01-10',
    documentCount: 25
  },
]

export default function KnowledgeBasePage() {
  const { t, language } = useTranslation()
  const { sidebar } = useApp()
  const [items, setItems] = useState<KnowledgeItem[]>(mockKnowledgeItems)
  const [searchQuery, setSearchQuery] = useState('')
  const { swipeProgress, handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({ targetPath: '/' })

  // 删除确认状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [deletingItemName, setDeletingItemName] = useState('')

  // 创建知识库
  const handleCreateKnowledgeBase = () => {
    console.log('Create new knowledge base')
  }

  // 处理删除 - 打开确认对话框
  const handleDelete = useCallback((e: React.MouseEvent, itemId: string, itemName: string) => {
    e.stopPropagation()
    setDeletingItemId(itemId)
    setDeletingItemName(itemName)
    setDeleteDialogOpen(true)
  }, [])

  // 确认删除操作
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingItemId) return

    try {
      // TODO: 调用后端API删除
      console.log('Deleting item:', deletingItemId)
      // 从本地列表中移除，避免刷新导致滚动位置丢失
      setItems(prev => prev.filter(item => item.id !== deletingItemId))
      setDeleteDialogOpen(false)
    } catch (error) {
      console.error('Failed to delete item:', error)
      setDeleteDialogOpen(false)
    }
  }, [deletingItemId])

  // 过滤搜索结果
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 格式化时间
  const formatDate = (dateStr: string) => {
    const localeMap: Record<string, string> = {
      'en': 'en-US',
      'zh': 'zh-CN',
      'ja': 'ja-JP'
    }
    return new Date(dateStr).toLocaleDateString(localeMap[language])
  }

  return (
    <div className="bg-transparent overflow-x-hidden w-full h-full flex flex-col">
      {/* 极窄毛玻璃 Header - h-14 固定高度，fixed 定位 */}
      <header className="fixed top-0 left-0 right-0 z-40 h-14 px-6 lg:pl-[76px] backdrop-blur-xl bg-white/70 dark:bg-[#020617]/70 border-b border-slate-200/50 dark:border-slate-700/30 transition-all duration-200" style={{
        paddingLeft: sidebar.isCollapsed ? '12px' : '76px'
      }}>
        <div className="w-full max-w-5xl mx-auto h-full flex items-center">
          {/* 左侧：图标 + 标题 */}
          <div className="flex items-center h-full">
            <Search className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-3" />
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('knowledgeBase')}
            </h2>
          </div>
          {/* 右侧：功能操作区 */}
          <button
            onClick={handleCreateKnowledgeBase}
            className="ml-auto px-3 h-9 rounded-full bg-violet-500 hover:bg-violet-600 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-violet-500/25"
            title={t('newKnowledgeBase')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 可滚动内容区 - 添加 pt-14 避免内容被 header 遮挡 */}
      <div
        className="h-full overflow-y-auto scrollbar-thin overscroll-behavior-y-contain overflow-x-hidden pt-14"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 移动端滑动返回指示器 */}
        <SwipeBackIndicator swipeProgress={swipeProgress} />

        {/* 拖拽上传区 - 隐蔽 */}
        <div className="md:hidden mx-6 mt-6">
          <div className="border-2 border-dashed border-violet-200 dark:border-violet-800/30 rounded-xl p-6 text-center text-sm text-slate-400 dark:text-slate-500 transition-colors">
            <Upload className="w-8 h-8 mx-auto mb-2 text-violet-400" />
            <p>{t('dragFilesToUpload') || '拖拽文件到此处上传'}</p>
          </div>
        </div>
        {/* 搜索框 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-3 md:pb-3 mt-8">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <Input
              type="text"
              placeholder={t('searchKnowledge')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* 数据统计信息 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4 md:pb-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>
              {searchQuery
                ? `${filteredItems.length} ${t('matchingItems') || 'matching items'}`
                : `${items.length} ${t('totalItems') || 'total items'}`
              }
            </span>
          </div>
        </div>

        {/* 知识库列表 */}
        <div className="max-w-5xl mx-auto px-6 md:px-12 pb-24 md:pb-20 space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex items-center gap-3 group relative bg-white dark:bg-slate-900/50 rounded-xl p-4',
                'hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-l-2 hover:border-violet-500 transition-all cursor-pointer border border-slate-200 dark:border-slate-700/50 shadow-sm'
              )}
            >
              {/* 图标 */}
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  item.type === 'folder'
                    ? 'bg-purple-100 dark:bg-purple-900/30'
                    : 'bg-indigo-100 dark:bg-indigo-900/30'
                )}
              >
                <FileText
                  className={cn(
                    'w-5 h-5',
                    item.type === 'folder'
                      ? 'text-purple-500'
                      : 'text-indigo-500'
                  )}
                />
              </div>

              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate mb-2">
                  {item.name}
                </h3>
                <div className="flex items-center gap-2">
                  {item.type === 'folder' ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {item.documentCount} {t('documents')}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {item.size}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.type === 'folder' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    title={t('uploadDocument')}
                  >
                    <Upload className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8"
                  title={t('delete')}
                  onClick={(e) => handleDelete(e, item.id, item.name)}
                >
                  <Trash2 className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-12 px-6 md:px-12 pb-24 md:pb-20">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? t('noKnowledgeFound') : t('noKnowledgeContent')}
            </p>
            {!searchQuery && (
              <Button className="mt-4" variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                {t('createFirstKnowledge')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false)
          setDeletingItemId(null)
          setDeletingItemName('')
        }}
        onConfirm={handleConfirmDelete}
        title={t('confirmDeleteTitle')}
        description={t('confirmDeleteDescription')}
        itemName={deletingItemName}
      />
    </div>
  )
}

