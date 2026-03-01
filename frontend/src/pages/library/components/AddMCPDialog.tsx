/**
 * 添加 MCP 服务器弹窗
 * 
 * 与 PersonalSettingsDialog 保持统一风格
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useCreateMCP } from '@/hooks/queries/useMCPQuery'
import { BauhausInput } from '@/components/ui/bauhaus-input'
import { useTranslation } from '@/i18n'
import { logger } from '@/utils/logger'
import { useToast } from '@/components/ui/use-toast'
import type { MCPTransport } from '@/types/mcp'

interface AddMCPDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function AddMCPDialog({ isOpen, onClose }: AddMCPDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createMutation = useCreateMCP()
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sse_url: '',
    transport: 'sse' as MCPTransport
  })

  // 打开时重置表单
  useEffect(() => {
    if (isOpen) {
      setFormData({ name: '', description: '', sse_url: '', transport: 'sse' })
    }
  }, [isOpen])

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

    createMutation.mutate(
      {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        sse_url: formData.sse_url.trim(),
        transport: formData.transport
      },
      {
        onSuccess: () => {
          toast({
            title: t('success') || 'Success',
            description: t('mcpServerAdded') || 'MCP server added successfully',
          })
          setFormData({ name: '', description: '', sse_url: '', transport: 'sse' })
          onClose()
        },
        onError: (error: any) => {
          logger.error('[AddMCPDialog] Failed to add:', error)
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
    if (!createMutation.isPending) {
      onClose()
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="relative bg-surface-card border-2 border-border-default shadow-hard-xl w-[420px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - 与 PersonalSettingsDialog 统一 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-hover"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {t('addModule') || 'Add Module'}
            </span>
          </div>
          <button
            onClick={handleClose}
            disabled={createMutation.isPending}
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
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('moduleName') || 'Module Name'} *
              </span>
            </div>
            <BauhausInput
              required
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('serverNamePlaceholder') || 'e.g. Amap'}
              disabled={createMutation.isPending}
            />
          </section>

          {/* 描述 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('description') || 'Description'} ({t('optional') || 'Optional'})
              </span>
            </div>
            <BauhausInput
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('mcpDescriptionPlaceholder') || 'Describe what this MCP server provides...'}
              disabled={createMutation.isPending}
            />
          </section>

          {/* 传输协议 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
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
                  disabled={createMutation.isPending}
                  className="w-4 h-4 accent-accent-hover"
                />
                <span className="font-mono text-xs">{t('transportSSE') || 'SSE'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="transport"
                  value="streamable_http"
                  checked={formData.transport === 'streamable_http'}
                  onChange={(e) => setFormData({ ...formData, transport: e.target.value as MCPTransport })}
                  disabled={createMutation.isPending}
                  className="w-4 h-4 accent-accent-hover"
                />
                <span className="font-mono text-xs">{t('transportStreamableHTTP') || 'Streamable HTTP'}</span>
              </label>
            </div>
          </section>

          {/* SSE URL */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                Endpoint URL *
              </span>
            </div>
            <BauhausInput
              required
              type="url"
              value={formData.sse_url}
              onChange={(e) => setFormData({ ...formData, sse_url: e.target.value })}
              placeholder={formData.transport === 'sse' ? 'https://mcp.example.com/sse' : 'https://mcp.example.com/mcp'}
              disabled={createMutation.isPending}
              className="font-mono text-sm"
            />
            <p className="mt-2 font-mono text-[10px] text-content-secondary">
              {formData.transport === 'sse' 
                ? 'SSE endpoint URL for Server-Sent Events transport'
                : 'HTTP endpoint URL for Streamable HTTP transport'}
            </p>
          </section>
        </form>

        {/* 底部按钮 - 与 PersonalSettingsDialog 统一 */}
        <div className="flex gap-0 border-t-2 border-border-default">
          <button
            type="button"
            onClick={handleClose}
            disabled={createMutation.isPending}
            className="flex-1 py-3 font-mono text-sm font-bold uppercase border-r-2 border-border-default hover:bg-surface-page transition-colors disabled:opacity-50"
          >
            {t('cancel') || 'Cancel'}
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="flex-1 py-3 bg-accent-hover text-content-primary font-mono text-sm font-bold uppercase hover:brightness-95 transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-content-primary/30 border-t-content-primary animate-spin"></span>
                {t('connecting') || 'Connecting...'}
              </span>
            ) : (
              t('add') || 'Add'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default AddMCPDialog
