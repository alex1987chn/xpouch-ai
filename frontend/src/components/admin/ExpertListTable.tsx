/**
 * ExpertListTable - 专家列表组件
 * 
 * [职责]
 * 纯展示组件，渲染左侧专家列表区域
 * - 搜索框
 * - 刷新按钮
 * - 新建按钮
 * - 专家列表（含选中状态、删除按钮）
 */

import { Search, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import type { SystemExpert } from '@/services/admin'

interface ExpertListTableProps {
  experts: SystemExpert[]
  selectedExpertKey: string | null
  searchQuery: string
  isLoading: boolean
  onSelectExpert: (expertKey: string) => void
  onDeleteExpert: (expert: SystemExpert, e: React.MouseEvent) => void
  onSearchChange: (query: string) => void
  onRefresh: () => void
  onCreateClick: () => void
}

export default function ExpertListTable({
  experts,
  selectedExpertKey,
  searchQuery,
  isLoading,
  onSelectExpert,
  onDeleteExpert,
  onSearchChange,
  onRefresh,
  onCreateClick,
}: ExpertListTableProps) {
  const { t } = useTranslation()

  // 过滤专家列表
  const filteredExperts = experts.filter(
    (expert) =>
      expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expert.expert_key.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0]">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-color)] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[var(--accent-hover)]" />
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            /// {t('expertsHeader')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCreateClick}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase border border-[var(--border-color)] bg-[var(--bg-page)] hover:bg-[var(--accent-hover)] hover:text-black hover:border-[var(--accent-hover)] transition-colors"
            title={t('newExpert')}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('newExpert')}</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="w-7 h-7 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            title={t('refresh')}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="p-3 border-b-2 border-[var(--border-color)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-xs focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
          />
        </div>
      </div>

      {/* 专家列表 */}
      <div className="flex-1 overflow-y-auto bauhaus-scrollbar p-2">
        <div className="space-y-1">
          {filteredExperts.map((expert) => (
            <button
              key={expert.id}
              onClick={() => onSelectExpert(expert.expert_key)}
              className={cn(
                'w-full text-left px-3 py-3 border-2 transition-all relative group',
                selectedExpertKey === expert.expert_key
                  ? 'border-[var(--accent-hover)] bg-[var(--accent-hover)] text-black shadow-[var(--shadow-color)_2px_2px_0_0]'
                  : 'border-transparent hover:border-[var(--border-color)] hover:bg-[var(--bg-page)]'
              )}
            >
              {/* 选中指示器 */}
              {selectedExpertKey === expert.expert_key && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-black" />
              )}

              {/* 删除按钮（仅对动态专家显示） */}
              {expert.is_dynamic && (
                <div
                  onClick={(e) => onDeleteExpert(expert, e)}
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded transition-colors opacity-0 group-hover:opacity-100',
                    selectedExpertKey === expert.expert_key
                      ? 'hover:bg-black/20 text-black/70 hover:text-black'
                      : 'hover:bg-red-100 text-[var(--text-secondary)] hover:text-red-500'
                  )}
                  title={t('deleteExpert')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={cn(
                  'font-mono text-sm font-bold',
                  selectedExpertKey === expert.expert_key
                    ? 'text-black'
                    : 'text-[var(--text-primary)]',
                  expert.is_dynamic && 'pr-6'
                )}
              >
                {expert.name}
              </div>
              <div
                className={cn(
                  'font-mono text-[9px] mt-1 uppercase',
                  selectedExpertKey === expert.expert_key
                    ? 'text-black/70'
                    : 'text-[var(--text-secondary)]'
                )}
              >
                {expert.expert_key}
              </div>
            </button>
          ))}
        </div>
        {filteredExperts.length === 0 && (
          <div className="text-center font-mono text-xs text-[var(--text-secondary)] py-8">
            {t('noMatchExpert')}
          </div>
        )}
      </div>
    </div>
  )
}
