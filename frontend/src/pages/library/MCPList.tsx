/**
 * MCP 服务器列表组件
 * 
 * 与 HistoryPage 风格保持一致
 * 手风琴模式：同时只能展开一个卡片
 */

import { useState, useEffect, useRef } from 'react'
import { Server, Plus } from 'lucide-react'
import { useMCPServers } from '@/hooks/queries/useMCPQuery'
import { SearchInput } from '@/components/ui/input'
import { CardSkeleton } from '@/components/ui/skeleton'
import { ErrorState, EmptyState } from '@/components/ui/states'
import MCPCard from './components/MCPCard'
import { AddMCPDialog } from './components/AddMCPDialog'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'

interface MCPListProps {
 searchQuery?: string
 onSearchChange?: (value: string) => void
 isAdmin?: boolean
}

export function MCPList({ searchQuery, onSearchChange, isAdmin = false }: MCPListProps) {
 const { t } = useTranslation()
 const { data: servers, isLoading, isError, refetch } = useMCPServers()
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

 // 加载状态（与下方服务卡片堆叠布局同构）
 if (isLoading) {
  return (
   <div className="space-y-4">
    {Array.from({ length: 3 }, (_, i) => (
     <CardSkeleton key={i} />
    ))}
   </div>
  )
 }

 // 错误状态
 if (isError) {
  return (
   <ErrorState
    message={t('loadFailed') || 'Failed to load'}
    onRetry={() => refetch()}
   />
  )
 }

 return (
  <div className="space-y-4">
   {/* 工具栏：搜索 + 添加按钮 */}
   <div className="flex items-center gap-3">
    {/* 搜索框 - 仅在独立使用时显示 */}
    {!isExternalSearch && (
     <SearchInput
      value={effectiveSearchQuery}
      onChange={(value) => onSearchChange?.(value)}
      placeholder={t('searchMCPServers') || 'Search MCP servers...'}
      className="flex-1"
     />
    )}

    {/* 添加按钮 - 仅管理员可见 */}
    {isAdmin && (
     <button
      onClick={() => setIsAddOpen(true)}
      className={cn(
       "flex h-9 items-center gap-2 rounded-full px-4",
       "bg-accent-brand text-accent-ink text-xs font-bold",
       "border border-border-divider shadow-none",
       "hover:-translate-y-px hover:shadow-theme-card",
       "active:translate-y-0 active:shadow-none",
       "transition-all"
      )}
     >
      <Plus className="h-4 w-4" />
      <span>{t('add') || 'ADD'}</span>
     </button>
    )}
   </div>

   {/* 统计 */}
   {!isLoading && filteredServers.length > 0 && (
    <div className="flex items-center gap-2 text-micro text-content-muted">
     <div className="h-1.5 w-1.5 rounded-full bg-accent-brand" />
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
    <div ref={listContainerRef} className="space-y-0">
     {filteredServers.map((server, index) => (
      <div
       key={server.id}
       className="stagger-item"
       style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      >
       <MCPCard
        server={server}
        isExpanded={expandedId === server.id}
        isAdmin={isAdmin}
        onToggleExpand={() => handleToggleExpand(server.id)}
       />
      </div>
     ))}
    </div>
   ) : (
    /* 空状态（统一组件）：无服务器时给管理员「添加」CTA */
    <EmptyState
     variant="card"
     icon={Server}
     title={
      effectiveSearchQuery
       ? (t('noMatchingServers') || 'No matching servers')
       : (t('noMCPServers') || 'No MCP servers')
     }
     description={
      effectiveSearchQuery
       ? (t('tryOtherKeywords') || 'Try other keywords')
       : (t('clickAddToConnect') || 'Click ADD to connect an MCP server')
     }
     action={
      isAdmin && !effectiveSearchQuery
       ? { label: t('add') || 'Add', onClick: () => setIsAddOpen(true) }
       : undefined
     }
    />
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
