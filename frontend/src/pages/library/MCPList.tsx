/**
 * MCP 服务器列表组件
 * 
 * 与 HistoryPage 风格保持一致
 * 手风琴模式：同时只能展开一个卡片
 */

import { useState, useEffect, useRef } from 'react'
import { Server, Plus } from 'lucide-react'
import { useMCPServers } from '@/hooks/queries/useMCPQuery'
import { BauhausSearchInput } from '@/components/ui/bauhaus-input'
import MCPCard from './components/MCPCard'
import { AddMCPDialog } from './components/AddMCPDialog'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'

interface MCPListProps {
  searchQuery?: string
  onSearchChange?: (value: string) => void
}

export function MCPList({ searchQuery, onSearchChange }: MCPListProps) {
  const { t } = useTranslation()
  const { data: servers, isLoading, isError } = useMCPServers()
  const [isAddOpen, setIsAddOpen] = useState(false)
  // 🔥 手风琴模式：记录当前展开的服务器 ID
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // 🔥 记录最后创建的服务器 ID，用于自动展开和滚动
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null)
  // 列表容器 ref，用于滚动
  const listContainerRef = useRef<HTMLDivElement>(null)
  
  // 是否使用外部搜索（由父组件控制）
  const isExternalSearch = searchQuery !== undefined
  const effectiveSearchQuery = isExternalSearch ? searchQuery : ''

  // 过滤
  const filteredServers = servers?.filter(server => 
    effectiveSearchQuery.trim() === '' || 
    server.name.toLowerCase().includes(effectiveSearchQuery.toLowerCase())
  ) || []

  // 🔥 自动展开并滚动到新创建的服务器
  useEffect(() => {
    if (lastCreatedId && servers) {
      const newServerExists = servers.some(s => s.id === lastCreatedId)
      if (newServerExists) {
        // 自动展开新服务器
        setExpandedId(lastCreatedId)
        // 滚动到底部（新项目通常在最后）
        setTimeout(() => {
          listContainerRef.current?.scrollTo({
            top: listContainerRef.current.scrollHeight,
            behavior: 'smooth'
          })
        }, 100)
        // 清理状态
        setLastCreatedId(null)
      }
    }
  }, [servers, lastCreatedId])

  // 切换展开状态（手风琴模式）
  const handleToggleExpand = (serverId: string) => {
    setExpandedId(prev => prev === serverId ? null : serverId)
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className="text-center py-20 font-mono text-sm text-content-muted uppercase">
        {t('loading') || 'Loading...'}
      </div>
    )
  }

  // 错误状态
  if (isError) {
    return (
      <div className="text-center py-20 font-mono text-sm text-accent-destructive uppercase">
        {t('loadFailed') || 'Failed to load'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 工具栏：搜索 + 添加按钮 */}
      <div className="flex items-center gap-3">
        {/* 搜索框 - 仅在独立使用时显示 */}
        {!isExternalSearch && (
          <BauhausSearchInput
            value={effectiveSearchQuery}
            onChange={(value) => onSearchChange?.(value)}
            placeholder={t('searchMCPServers') || 'Search MCP servers...'}
            className="flex-1"
          />
        )}
        
        {/* 添加按钮 */}
        <button
          onClick={() => setIsAddOpen(true)}
          className={cn(
            "h-11 px-4 flex items-center gap-2",
            "bg-surface-elevated text-content-primary font-mono text-xs font-bold uppercase",
            "border-2 border-border-default shadow-hard",
            "hover:bg-accent-brand hover:text-content-inverted hover:border-accent-brand",
            "hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-hard-hover",
            "active:translate-x-0 active:translate-y-0 active:shadow-hard",
            "transition-all"
          )}
        >
          <Plus className="w-4 h-4" />
          <span>{t('add') || 'ADD'}</span>
        </button>
      </div>

      {/* 统计 */}
      {!isLoading && filteredServers.length > 0 && (
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-content-muted">
          <div className="w-1.5 h-1.5 bg-accent-brand" />
          <span>
            {effectiveSearchQuery
              ? `${filteredServers.length} ${t('matching') || 'matching'}`
              : `${servers?.length || 0} ${t('totalItems') || 'total'}`
            }
          </span>
        </div>
      )}

      {/* 列表 */}
      {filteredServers.length > 0 ? (
        <div ref={listContainerRef} className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filteredServers.map((server) => (
            <MCPCard 
              key={server.id} 
              server={server} 
              isExpanded={expandedId === server.id}
              onToggleExpand={() => handleToggleExpand(server.id)}
            />
          ))}
        </div>
      ) : (
        /* 空状态 - 与 HistoryPage 一致 */
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 border-2 border-border-default bg-surface-page flex items-center justify-center">
            <Server className="w-8 h-8 text-content-muted" />
          </div>
          <h3 className="font-mono text-base font-bold text-content-primary uppercase mb-2">
            {effectiveSearchQuery
              ? t('noMatchingServers') || 'No matching servers'
              : t('noMCPServers') || 'No MCP servers'
            }
          </h3>
          <p className="font-mono text-xs text-content-muted uppercase">
            {effectiveSearchQuery
              ? t('tryOtherKeywords') || 'Try other keywords'
              : t('clickAddToConnect') || 'Click ADD to connect an MCP server'
            }
          </p>
        </div>
      )}

      {/* 添加弹窗 */}
      <AddMCPDialog 
        isOpen={isAddOpen} 
        onClose={() => setIsAddOpen(false)}
        onSuccess={(serverId) => setLastCreatedId(serverId)}
      />
    </div>
  )
}

export default MCPList
