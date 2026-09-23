/**
 * MCP 服务器表单弹窗（添加 / 编辑共用）
 *
 * 单一表单真相源：mode='add' 创建、mode='edit' 预填现有配置走 PATCH。
 * 编辑保存时后端会按「最终 URL + 最终协议」通电测试并失效工具缓存，
 * 专家下一个请求即按新清单发现工具。
 *
 * 风格与 PersonalSettingsDialog 保持统一。
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useCreateMCP, useUpdateMCP } from '@/hooks/queries/useMCPQuery'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n'
import { logger } from '@/utils/logger'
import { useToast } from '@/components/ui/use-toast'
import type { MCPServer, MCPTransport } from '@/types/mcp'
import { Z_INDEX } from '@/constants/zIndex'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useDialogA11y } from '@/hooks/useDialogA11y'

interface MCPFormDialogProps {
  isOpen: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  /** edit 模式必传：待编辑的服务器 */
  server?: MCPServer
  /** 创建成功回调，返回新服务器 ID */
  onSuccess?: (serverId: string) => void
}

const EMPTY_FORM = {
  name: '',
  description: '',
  sse_url: '',
  transport: 'sse' as MCPTransport
}

export function MCPFormDialog({ isOpen, onClose, mode, server, onSuccess }: MCPFormDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const isEdit = mode === 'edit'
  const createMutation = useCreateMCP()
  const updateMutation = useUpdateMCP()
  const isPending = createMutation.isPending || updateMutation.isPending

  const [formData, setFormData] = useState(EMPTY_FORM)

  // 打开时重置表单（编辑模式预填现有配置）
  useEffect(() => {
    if (isOpen) {
      if (isEdit && server) {
        setFormData({
          name: server.name,
          description: server.description ?? '',
          sse_url: server.sse_url,
          transport: server.transport
        })
      } else {
        setFormData(EMPTY_FORM)
      }
    }
  }, [isOpen, isEdit, server])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim() || !formData.sse_url.trim()) {
      toast({
        title: t('validationError') || 'Validation Error',
        description: t('nameAndUrlRequired') || 'Name and URL are required',
        variant: 'destructive'
      })
      return
    }

    if (isEdit && server) {
      updateMutation.mutate(
        {
          id: server.id,
          data: {
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            sse_url: formData.sse_url.trim(),
            transport: formData.transport
          }
        },
        {
          onSuccess: () => {
            toast({
              title: t('success') || 'Success',
              description: t('mcpServerUpdated') || 'MCP server saved',
            })
            onClose()
          },
          onError: (error: any) => {
            logger.error('[MCPFormDialog] Failed to update:', error)
            toast({
              title: t('error') || 'Error',
              description: error.message || t('toggleFailed') || 'Update failed',
              variant: 'destructive'
            })
          }
        }
      )
      return
    }

    createMutation.mutate(
      {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        sse_url: formData.sse_url.trim(),
        transport: formData.transport
      },
      {
        onSuccess: (newServer) => {
          toast({
            title: t('success') || 'Success',
            description: t('mcpServerAdded') || 'MCP server added successfully',
          })
          setFormData(EMPTY_FORM)
          onSuccess?.(newServer.id)
          onClose()
        },
        onError: (error: any) => {
          logger.error('[MCPFormDialog] Failed to add:', error)
          toast({
            title: t('error') || 'Error',
            description: error.message || t('failedToAddServer') || 'Failed to add server',
            variant: 'destructive'
          })
        }
      }
    )
  }

  const handleClose = () => {
    if (!isPending) {
      onClose()
    }
  }

  useEscapeToClose(isOpen, handleClose)
  const a11y = useDialogA11y<HTMLDivElement>(isOpen, 'mcp-form-title')

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-surface-scrim/45 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={handleClose}
    >
      <div
        {...a11y}
        className="relative bg-surface-card rounded-lg border-theme-card border-border-default shadow-theme-modal w-[420px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - 与 PersonalSettingsDialog 统一 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-divider">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-hover"></div>
            <span id="mcp-form-title" className="text-xs font-bold text-content-secondary">
              {isEdit
                ? (t('editModule') || 'Edit MCP Server')
                : (t('addModule') || 'Add Module')}
            </span>
          </div>
          <button
            aria-label={t('close')}
            onClick={handleClose}
            disabled={isPending}
            className="w-6 h-6 flex items-center justify-center border border-border-default hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-5">
          {/* 模块名称 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="text-xs font-bold text-content-secondary">
                {t('moduleName') || 'Module Name'} *
              </span>
            </div>
            <Input
              required
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('serverNamePlaceholder') || 'e.g. Amap'}
              disabled={isPending}
            />
          </section>

          {/* 描述 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="text-xs font-bold text-content-secondary">
                {t('description') || 'Description'} ({t('optional') || 'Optional'})
              </span>
            </div>
            <Input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('mcpDescriptionPlaceholder') || 'Describe what this MCP server provides...'}
              disabled={isPending}
            />
          </section>

          {/* 传输协议 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="text-xs font-bold text-content-secondary">
                {t('transportProtocol') || 'Protocol'}
              </span>
            </div>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="transport"
                  value="sse"
                  checked={formData.transport === 'sse'}
                  onChange={(e) => setFormData({ ...formData, transport: e.target.value as MCPTransport })}
                  disabled={isPending}
                  className="w-4 h-4 accent-accent-hover"
                />
                <span className="text-xs">{t('transportSSE') || 'SSE'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="transport"
                  value="streamable_http"
                  checked={formData.transport === 'streamable_http'}
                  onChange={(e) => setFormData({ ...formData, transport: e.target.value as MCPTransport })}
                  disabled={isPending}
                  className="w-4 h-4 accent-accent-hover"
                />
                <span className="text-xs">{t('transportStreamableHTTP') || 'Streamable HTTP'}</span>
              </label>
            </div>
          </section>

          {/* Endpoint URL */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="text-xs font-bold text-content-secondary">
                Endpoint URL *
              </span>
            </div>
            <Input
              required
              type="url"
              value={formData.sse_url}
              onChange={(e) => setFormData({ ...formData, sse_url: e.target.value })}
              placeholder={formData.transport === 'sse' ? 'https://mcp.example.com/sse' : 'https://mcp.example.com/mcp'}
              disabled={isPending}
              className="font-mono text-sm"
            />
            <p className="mt-2 text-caption text-content-muted">
              {formData.transport === 'sse'
                ? 'SSE endpoint URL for Server-Sent Events transport'
                : 'HTTP endpoint URL for Streamable HTTP transport'}
            </p>
          </section>
        </form>

        {/* 底部按钮：右对齐胶囊组 */}
        <div className="flex justify-end gap-2 border-t border-border-divider px-5 py-3.5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="rounded-full border border-border-divider bg-surface-page px-4 py-2 text-body-sm font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50"
          >
            {t('cancel') || 'Cancel'}
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-full border border-border-divider bg-accent-brand px-5 py-2 text-body-sm font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink"></span>
                {isEdit
                  ? (t('saving') || 'Saving...')
                  : (t('connecting') || 'Connecting...')}
              </span>
            ) : (
              isEdit
                ? (t('save') || 'Save')
                : (t('add') || 'Add')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default MCPFormDialog
