/**
 * MCP 服务器卡片组件
 * 
 * 手风琴模式：点击展开显示工具列表
 */

import { useState } from 'react'
import { ChevronDown, Wrench } from 'lucide-react'
import { useToggleMCP, useDeleteMCP, useMCPServerTools } from '@/hooks/queries/useMCPQuery'
import { useTranslation } from '@/i18n'
import { logger } from '@/utils/logger'
import { useToast } from '@/components/ui/use-toast'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { cn } from '@/lib/utils'
import type { MCPServer } from '@/types/mcp'

interface MCPCardProps {
  server: MCPServer
  isExpanded: boolean
  onToggleExpand: () => void
}

export function MCPCard({ server, isExpanded, onToggleExpand }: MCPCardProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const toggleMutation = useToggleMCP()
  const deleteMutation = useDeleteMCP()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  // 仅在展开时获取工具列表
  const { data: tools, isLoading: isLoadingTools, isError: isToolsError } = useMCPServerTools(
    server.id,
    { enabled: isExpanded && server.is_active && server.connection_status === 'connected' }
  )

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(server.id)
    toast({
      title: t('deleted') || 'Deleted',
      description: `${server.name} ${t('removed') || 'removed'}`,
    })
  }

  const handleToggle = () => {
    toggleMutation.mutate(
      { id: server.id, is_active: !server.is_active },
      {
        onError: (error: any) => {
          logger.error('[MCPCard] Failed to toggle:', error)
          toast({
            title: t('error') || 'Error',
            description: error.message || t('toggleFailed') || 'Toggle failed',
            variant: 'destructive'
          })
        }
      }
    )
  }

  // 状态指示灯颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const canShowTools = server.is_active && server.connection_status === 'connected'

  return (
    <>
      <div
        className={cn(
          "group relative bg-surface-card border-2 border-border-default",
          "shadow-hard transition-all",
          isExpanded ? "" : "hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-hard-hover"
        )}
      >
        {/* 卡片头部 - 点击展开/折叠 */}
        <div 
          className="p-3 cursor-pointer"
          onClick={() => canShowTools && onToggleExpand()}
        >
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 min-w-0">
              {/* 标题行 */}
              <div className="flex items-center gap-2">
                <div 
                  className={cn("w-2 h-2 rounded-full", getStatusColor(server.connection_status))}
                  title={server.connection_status}
                />
                <h3 className="font-mono text-sm font-bold text-content-primary truncate">
                  {server.name}
                </h3>
                {canShowTools && (
                  <ChevronDown 
                    className={cn(
                      "w-4 h-4 text-content-muted transition-transform ml-1",
                      isExpanded && "rotate-180"
                    )} 
                  />
                )}
              </div>
              
              {/* 描述 */}
              <p className="font-mono text-xs text-content-muted line-clamp-1 mt-1">
                {server.description || t('noDescription')}
              </p>
              
              {/* URL */}
              <p className="font-mono text-[10px] text-content-muted truncate mt-1">
                {server.sse_url}
              </p>
            </div>

            {/* 右侧操作区 */}
            <div className="flex flex-col items-end gap-2">
              {/* 删除按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsDeleteDialogOpen(true)
                }}
                className="w-8 h-8 flex items-center justify-center border border-border-default text-content-muted hover:bg-accent-destructive hover:text-white hover:border-accent-destructive transition-colors opacity-0 group-hover:opacity-100"
                title={t('delete') || 'Delete'}
              >
                <span className="font-mono text-xs font-bold">×</span>
              </button>
              
              {/* Toggle 开关 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggle()
                }}
                disabled={toggleMutation.isPending}
                className={cn(
                  "relative w-12 h-6 border-2 border-border-default flex items-center p-0.5 cursor-pointer transition-colors",
                  server.is_active ? 'bg-accent-brand' : 'bg-surface-page'
                )}
                aria-label={server.is_active ? t('disable') : t('enable')}
              >
                <div 
                  className={cn(
                    "w-4 h-4 bg-surface-card border-2 border-border-default transition-transform duration-200",
                    server.is_active ? 'translate-x-[20px]' : 'translate-x-0'
                  )} 
                />
              </button>
            </div>
          </div>
        </div>

        {/* 展开的工具列表 */}
        {isExpanded && canShowTools && (
          <div className="border-t-2 border-border-default bg-surface-page/50">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="w-3.5 h-3.5 text-content-muted" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-muted">
                  {t('availableTools') || 'Available Tools'} ({tools?.length ?? 0})
                </span>
              </div>
              
              {isLoadingTools ? (
                <div className="py-4 text-center font-mono text-xs text-content-muted">
                  {t('loading') || 'Loading...'}
                </div>
              ) : isToolsError ? (
                <div className="py-4 text-center font-mono text-xs text-accent-destructive">
                  {t('failedToLoadTools') || 'Failed to load tools'}
                </div>
              ) : tools && tools.length > 0 ? (
                <div className="space-y-2">
                  {tools.map((tool) => (
                    <div 
                      key={tool.name}
                      className="bg-surface-card border border-border-default/50 p-2"
                    >
                      <div className="font-mono text-xs font-bold text-content-primary">
                        {tool.name}
                      </div>
                      <div className="font-mono text-[10px] text-content-muted mt-0.5 line-clamp-2">
                        {tool.description}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center font-mono text-xs text-content-muted">
                  {t('noToolsAvailable') || 'No tools available'}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* 未连接时的提示 */}
        {isExpanded && !canShowTools && (
          <div className="border-t-2 border-border-default bg-surface-page/50 p-3">
            <div className="font-mono text-xs text-content-muted text-center">
              {server.connection_status !== 'connected' 
                ? (t('serverNotConnected') || 'Server not connected')
                : (t('serverDisabled') || 'Server is disabled')
              }
            </div>
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title={t('confirmDeleteMCPServer') || 'Confirm Delete'}
        itemName={server.name}
        description={t('confirmDeleteDescription') || 'This action cannot be undone. Are you sure you want to continue?'}
      />
    </>
  )
}

export default MCPCard
