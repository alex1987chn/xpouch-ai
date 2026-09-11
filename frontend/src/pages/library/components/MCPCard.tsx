/**
 * MCP 服务器卡片组件
 *
 * 蓝本 mcp-row 语法：状态点 + 名称 + 命令行（mono 小字）+ 胶囊开关；
 * 点击展开工具列表（行内小卡）。
 * 手风琴模式：同时只能展开一个（父层 MCPList 控制）。
 */

import { useState } from 'react'
import { ChevronDown, Wrench } from 'lucide-react'
import { useToggleMCP, useDeleteMCP, useMCPServerTools } from '@/hooks/queries/useMCPQuery'
import { useTranslation } from '@/i18n'
import { logger } from '@/utils/logger'
import { useToast } from '@/components/ui/use-toast'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { MCPServer } from '@/types/mcp'

interface MCPCardProps {
  server: MCPServer
  isExpanded: boolean
  isAdmin?: boolean
  onToggleExpand: () => void
}

/** 胶囊开关（蓝本 .switch：34×19 轨道，开启品牌色，13px 白钮） */
export function PillSwitch({
  on,
  onToggle,
  disabled,
  ariaLabel,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={on}
      className={cn(
        'relative h-[19px] w-[34px] shrink-0 rounded-full border border-border-default transition-colors',
        on ? 'bg-accent-brand' : 'bg-surface-tint',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[13px] w-[13px] rounded-full border border-border-hover bg-surface-card transition-[left] duration-200',
          on ? 'left-[17px]' : 'left-[2px]'
        )}
      />
    </button>
  )
}

// URL 脱敏处理：遮盖域名后的所有路径和参数
// 示例: https://api.example.com/sse/xxx?key=abc => https://api.example.com/******
function maskUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // 只显示域名，后面的全部遮盖
    return `${urlObj.origin}/******`
  } catch {
    // URL解析失败，返回简单遮盖
    if (url.length <= 30) return url
    return url.slice(0, 25) + '...' + url.slice(-5)
  }
}

export function MCPCard({ server, isExpanded, isAdmin = false, onToggleExpand }: MCPCardProps) {
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

  // 状态指示灯颜色（蓝本 mcp-dot：sage=健康 / 陶土=异常 / 灰=未知）
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-accent-success'
      case 'error': return 'bg-accent-destructive'
      default: return 'bg-content-muted'
    }
  }

  const canShowTools = server.is_active && server.connection_status === 'connected'

  return (
    <>
      <div
        className={cn(
          "group mb-2.5 rounded-md border border-border-divider bg-surface-card transition-shadow",
          isExpanded ? "" : "hover:shadow-theme-card"
        )}
      >
        {/* 行头 - 点击展开/折叠（蓝本 mcp-row 布局） */}
        <div
          className="flex cursor-pointer items-center gap-3 px-4 py-3"
          onClick={() => canShowTools && onToggleExpand()}
        >
          <span
            className={cn('h-[9px] w-[9px] shrink-0 rounded-full', getStatusColor(server.connection_status))}
            title={server.connection_status}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h3 className="truncate text-[13px] font-bold text-content-primary">
                {server.name}
              </h3>
              {canShowTools && (
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-content-muted transition-transform",
                    isExpanded && "rotate-180"
                  )}
                />
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-[11.5px] text-content-muted" title={isAdmin ? server.sse_url : undefined}>
              {isAdmin ? server.sse_url : maskUrl(server.sse_url)}
            </p>
          </div>

          {/* 右侧操作区 - 仅管理员可见 */}
          {isAdmin && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsDeleteDialogOpen(true)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-accent-destructive/10 hover:text-accent-destructive opacity-0 group-hover:opacity-100"
                title={t('delete') || 'Delete'}
              >
                <span className="text-sm font-bold">×</span>
              </button>

              <PillSwitch
                on={server.is_active}
                onToggle={handleToggle}
                disabled={toggleMutation.isPending}
                ariaLabel={server.is_active ? t('disable') : t('enable')}
              />
            </div>
          )}
        </div>

        {/* 展开的工具列表（浅底内嵌区） */}
        {isExpanded && canShowTools && (
          <div className="border-t border-border-divider bg-surface-tint/40 px-4 py-3">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-content-muted" />
              <span className="text-[11.5px] font-bold text-content-muted">
                {t('availableTools') || 'Available Tools'} ({tools?.length ?? 0})
              </span>
            </div>

            {isLoadingTools ? (
              <div className="space-y-2 py-1">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : isToolsError ? (
              <div className="py-3 text-center text-xs text-accent-destructive">
                {t('failedToLoadTools') || 'Failed to load tools'}
              </div>
            ) : tools && tools.length > 0 ? (
              <div className="space-y-2">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="rounded-md border border-border-divider bg-surface-card p-2.5"
                  >
                    <div className="text-xs font-bold text-content-primary">
                      {tool.name}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-content-muted">
                      {tool.description}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 text-center text-xs text-content-muted">
                {t('noToolsAvailable') || 'No tools available'}
              </div>
            )}
          </div>
        )}

        {/* 未连接时的提示 */}
        {isExpanded && !canShowTools && (
          <div className="border-t border-border-divider bg-surface-tint/40 px-4 py-3">
            <div className="text-center text-xs text-content-muted">
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
