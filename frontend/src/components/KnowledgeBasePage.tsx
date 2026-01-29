import { useState, useCallback } from 'react'
import { Plus, FileText, Trash2, Upload, Search, Folder, File } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import SwipeBackIndicator from './SwipeBackIndicator'
import { useApp } from '@/providers/AppProvider'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { logger } from '@/utils/logger'

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
    // TODO: 实现创建知识库逻辑
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
      // 从本地列表中移除，避免刷新导致滚动位置丢失
      setItems(prev => prev.filter(item => item.id !== deletingItemId))
      setDeleteDialogOpen(false)
    } catch (error) {
      logger.error('Failed to delete item:', error)
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
      {/* Bauhaus Header - 硬边风格 */}
      <header className="fixed top-0 left-0 right-0 z-40 h-[60px] px-6 border-b-2 border-[var(--border-color)] bg-[var(--bg-card)] transition-all duration-200" style={{
        paddingLeft: sidebar.isCollapsed ? '88px' : '320px'
      }}>
        <div className="w-full max-w-5xl mx-auto h-full flex items-center">
          {/* 左侧：标题 */}
          <div className="flex items-center h-full gap-3">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              ///
            </span>
            <h2 className="text-base font-black uppercase tracking-tight text-[var(--text-primary)]">
              {t('knowledgeBase')}
            </h2>
          </div>
          {/* 右侧：功能操作区 - Bauhaus按钮 */}
          <button
            onClick={handleCreateKnowledgeBase}
            className="ml-auto h-10 px-4 border-2 border-[var(--border-color)] bg-[var(--accent-hover)] text-black font-bold font-mono text-xs uppercase shadow-[var(--shadow-color)_3px_3px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_4px_4px_0_0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2"
            title={t('newKnowledgeBase')}
          >
            <Plus className="w-4 h-4" />
            <span>NEW</span>
          </button>
        </div>
      </header>

      {/* 可滚动内容区 - Bauhaus风格 */}
      <div
        className="h-full overflow-y-auto bauhaus-scrollbar overscroll-behavior-y-contain overflow-x-hidden pt-[60px]"
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
              placeholder={t('searchKnowledge')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
            />
          </div>
        </div>

        {/* 数据统计信息 - Bauhaus风格 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
            <div className="w-1.5 h-1.5 bg-[var(--accent-hover)]"></div>
            <span>
              {searchQuery
                ? `${filteredItems.length} ${t('matchingItems') || 'matching'}`
                : `${items.length} ${t('totalItems') || 'total items'}`
              }
            </span>
          </div>
        </div>

        {/* 知识库列表 - Bauhaus卡片风格 */}
        <div className="max-w-5xl mx-auto px-6 md:px-12 pb-24 md:pb-20 space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="group relative bg-[var(--bg-card)] border-2 border-[var(--border-color)] p-3 cursor-pointer shadow-[var(--shadow-color)_3px_3px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[var(--shadow-color)_5px_5px_0_0] transition-all"
            >
              <div className="flex items-center gap-3">
                {/* 图标 - Bauhaus风格 */}
                <div
                  className={cn(
                    'w-10 h-10 border-2 border-[var(--border-color)] flex items-center justify-center flex-shrink-0',
                    item.type === 'folder'
                      ? 'bg-[var(--accent-hover)]'
                      : 'bg-[var(--bg-page)]'
                  )}
                >
                  {item.type === 'folder' ? (
                    <Folder className="w-5 h-5 text-black" />
                  ) : (
                    <File className="w-5 h-5 text-[var(--text-primary)]" />
                  )}
                </div>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-mono text-sm font-bold text-[var(--text-primary)] truncate">
                    {item.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    {item.type === 'folder' ? (
                      <span className="font-mono text-[10px] text-[var(--text-secondary)] uppercase">
                        {item.documentCount} docs
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-[var(--text-secondary)] uppercase">
                        {item.size}
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-[var(--text-secondary)] opacity-50">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 - Bauhaus风格 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.type === 'folder' && (
                    <button
                      className="w-8 h-8 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-hover)] hover:text-black transition-colors"
                      title={t('uploadDocument')}
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    className="w-8 h-8 flex items-center justify-center border border-[var(--border-color)] hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                    title={t('delete')}
                    onClick={(e) => handleDelete(e, item.id, item.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 空状态 - Bauhaus风格 */}
        {filteredItems.length === 0 && (
          <div className="text-center py-12 px-6 md:px-12 pb-24 md:pb-20">
            <div className="w-16 h-16 mx-auto mb-4 border-2 border-[var(--border-color)] bg-[var(--bg-page)] flex items-center justify-center">
              <FileText className="w-8 h-8 text-[var(--text-secondary)]" />
            </div>
            <p className="font-mono text-sm text-[var(--text-secondary)] uppercase">
              {searchQuery ? t('noKnowledgeFound') : t('noKnowledgeContent')}
            </p>
            {!searchQuery && (
              <button
                className="mt-6 h-10 px-4 border-2 border-[var(--border-color)] bg-[var(--accent-hover)] text-black font-bold font-mono text-xs uppercase shadow-[var(--shadow-color)_3px_3px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_4px_4px_0_0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                {t('createFirstKnowledge')}
              </button>
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

