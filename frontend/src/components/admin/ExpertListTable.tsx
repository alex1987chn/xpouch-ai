/**
 * ExpertListTable - 专家列表组件
 * 
 * 语义化改造：使用 CSS 变量替代硬编码样式
 */

import { Search, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import type { SystemExpert } from '@/services/admin'
import { useEffect, useRef } from 'react'

interface ExpertListTableProps {
  experts: SystemExpert[]
  selectedExpertKey: string | null
  searchQuery: string
  isLoading: boolean
  isAdmin: boolean
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
  isAdmin,
  onSelectExpert,
  onDeleteExpert,
  onSearchChange,
  onRefresh,
  onCreateClick,
}: ExpertListTableProps) {
  const { t } = useTranslation()
  const listContainerRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)

  // 过滤专家列表
  const filteredExperts = experts.filter(
    (expert) =>
      expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expert.expert_key.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 当选中项变化时，自动滚动到选中的专家
  useEffect(() => {
    if (selectedExpertKey && selectedItemRef.current && listContainerRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [selectedExpertKey])

  // 当列表数据变化且选中的是最后一条时（新创建的专家），滚动到底部
  useEffect(() => {
    if (
      filteredExperts.length > 0 &&
      selectedExpertKey &&
      listContainerRef.current
    ) {
      const lastExpert = filteredExperts[filteredExperts.length - 1]
      // 如果选中的是最后一条（新创建的），滚动到底部
      if (selectedExpertKey === lastExpert.expert_key) {
        listContainerRef.current.scrollTo({
          top: listContainerRef.current.scrollHeight,
          behavior: 'smooth',
        })
      }
    }
  }, [filteredExperts, selectedExpertKey])

  return (
    <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden border-2 border-border-default bg-surface-card shadow-theme-card">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-accent-hover" />
          <span className="text-xs font-bold uppercase tracking-widest text-content-secondary">
            /// {t('expertsHeader')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 创建按钮 - 仅管理员可见 */}
          {isAdmin && (
            <button
              onClick={onCreateClick}
              className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase border-2 border-border-default bg-surface-page hover:bg-accent-hover hover:text-content-primary hover:border-border-focus transition-colors"
              title={t('newExpert')}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('newExpert')}</span>
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="w-7 h-7 flex items-center justify-center border-2 border-border-default hover:bg-accent-hover transition-colors disabled:opacity-50"
            title={t('refresh')}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="p-3 border-b-2 border-border-default">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border-2 border-border-default bg-surface-page text-xs focus:outline-none focus:border-border-focus transition-colors"
          />
        </div>
      </div>

      {/* 专家列表 */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto bauhaus-scrollbar p-2">
        <div className="space-y-1">
          {filteredExperts.map((expert) => (
            <button
              key={expert.id}
              ref={expert.expert_key === selectedExpertKey ? selectedItemRef : undefined}
              onClick={() => onSelectExpert(expert.expert_key)}
              className={cn(
                'w-full text-left px-3 py-3 border transition-all relative group',
                selectedExpertKey === expert.expert_key
                  ? 'border-accent-hover border-l-[4px] border-l-content-primary bg-accent-hover text-content-primary shadow-theme-button'
                  : 'border-transparent hover:border-border-default hover:bg-surface-page'
              )}
            >

              {/* 删除按钮（仅对非系统核心组件且管理员显示） */}
              {!expert.is_system && isAdmin && (
                <div
                  onClick={(e) => onDeleteExpert(expert, e)}
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100',
                    selectedExpertKey === expert.expert_key
                      ? 'hover:bg-content-primary/20 text-content-primary/70 hover:text-content-primary'
                      : 'hover:bg-status-offline/10 text-content-secondary hover:text-status-offline'
                  )}
                  title={t('deleteExpert')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={cn(
                  'text-sm font-bold',
                  selectedExpertKey === expert.expert_key
                    ? 'text-content-primary'
                    : 'text-content-primary',
                  !expert.is_system && 'pr-6'
                )}
              >
                {expert.name}
              </div>
              <div
                className={cn(
                  'text-[9px] mt-1 uppercase tracking-wider',
                  selectedExpertKey === expert.expert_key
                    ? 'text-content-primary/70'
                    : 'text-content-secondary'
                )}
              >
                {expert.expert_key}
              </div>
            </button>
          ))}
        </div>
        {filteredExperts.length === 0 && (
          <div className="text-center text-xs text-content-secondary py-8">
            {t('noMatchExpert')}
          </div>
        )}
      </div>
    </div>
  )
}
