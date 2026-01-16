import { useState } from 'react'
import { Plus, FileText, Trash2, Upload, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

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
  const [items] = useState<KnowledgeItem[]>(mockKnowledgeItems)
  const [searchQuery, setSearchQuery] = useState('')

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
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 标题和操作栏 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">{t('knowledgeBase')}</h2>
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span>{t('newKnowledgeBase')}</span>
          </Button>
        </div>

        {/* 搜索栏 */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('searchKnowledge')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-10 pr-4 py-2 rounded-lg',
              'bg-card border border-border',
              'text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary/50'
            )}
          />
        </div>

        {/* 知识库列表 */}
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl',
                'bg-card border border-border',
                'hover:border-primary/50 transition-colors'
              )}
            >
              {/* 图标 */}
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  item.type === 'folder'
                    ? 'bg-amber-100 dark:bg-amber-900/30'
                    : 'bg-blue-100 dark:bg-blue-900/30'
                )}
              >
                <FileText
                  className={cn(
                    'w-5 h-5',
                    item.type === 'folder'
                      ? 'text-amber-500'
                      : 'text-blue-500'
                  )}
                />
              </div>

              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground truncate">
                  {item.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  {item.type === 'folder' ? (
                    <span className="text-xs text-muted-foreground">
                      {item.documentCount} {t('documents')}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {item.size}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2">
                {item.type === 'folder' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    title={t('uploadDocument')}
                  >
                    <Upload className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8"
                  title={t('delete')}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-12">
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
    </div>
  )
}
