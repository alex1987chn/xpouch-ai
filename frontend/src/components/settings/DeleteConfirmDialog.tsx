import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { logger } from '@/utils/logger'
import { Z_INDEX } from '@/constants/zIndex'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useDialogA11y } from '@/hooks/useDialogA11y'

interface DeleteConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  /** 弹窗标题（覆盖默认翻译） */
  title?: string
  /** 弹窗描述（覆盖默认翻译） */
  description?: string
  /** 要删除的项名称（高亮显示） */
  itemName?: string
  /** 删除按钮文本（覆盖默认翻译） */
  confirmText?: string
  /** 是否正在删除中（外部控制loading状态） */
  isDeleting?: boolean
  /** 警告类型：danger(红色删除) / warning(黄色警告) */
  variant?: 'danger' | 'warning'
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
  confirmText,
  isDeleting: externalIsDeleting,
  variant = 'danger',
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation()
  const [internalIsDeleting, setInternalIsDeleting] = useState(false)
  
  // 优先使用外部控制的 isDeleting，否则使用内部状态
  const isDeleting = externalIsDeleting !== undefined ? externalIsDeleting : internalIsDeleting

  const handleConfirm = async () => {
    if (externalIsDeleting === undefined) {
      setInternalIsDeleting(true)
    }
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      logger.error('Delete failed:', error)
    } finally {
      if (externalIsDeleting === undefined) {
        setInternalIsDeleting(false)
      }
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
      onClose()
    }
  }

  useEscapeToClose(isOpen, handleClose)
  const a11y = useDialogA11y<HTMLDivElement>(isOpen, 'delete-confirm-title')

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-surface-scrim/60 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={handleClose}
    >
      <div
        {...a11y}
        className="relative bg-surface-card rounded-lg border-theme-card border-border-default shadow-theme-modal w-[400px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部（蓝本 modal-head：标题 + 关闭） */}
        <div className="flex items-center justify-between border-b border-border-divider px-5 py-3.5">
          <span className="text-sm font-bold text-content-primary">
            {title || t('confirmDeleteTitle')}
          </span>
          <button
            aria-label={t('close')}
            onClick={handleClose}
            disabled={isDeleting}
            className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3.5">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              variant === 'danger'
                ? 'bg-status-offline/12 text-status-offline'
                : 'bg-accent-warning/12 text-accent-warning'
            }`}>
              {variant === 'danger' ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 pt-0.5">
              {itemName && (
                <div className="text-[13.5px] font-bold text-content-primary">
                  {itemName}
                </div>
              )}
              <p className="mt-1 text-xs leading-relaxed text-content-secondary">
                {description || t('confirmDeleteDescription')}
              </p>
            </div>
          </div>
        </div>

        {/* 底部按钮：右对齐胶囊组 */}
        <div className="flex justify-end gap-2 border-t border-border-divider px-5 py-3.5">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="rounded-full border border-border-divider bg-surface-page px-4 py-2 text-[13px] font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className={`rounded-full px-5 py-2 text-[13px] font-bold transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none ${
              variant === 'danger'
                ? 'bg-accent-destructive text-content-inverted'
                : 'bg-accent-warning text-accent-ink'
            }`}
          >
            {isDeleting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"></span>
                {t('deleting')}
              </span>
            ) : (
              confirmText || t('confirmDelete')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
