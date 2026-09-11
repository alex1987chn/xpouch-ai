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
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={handleClose}
    >
      <div
        {...a11y}
        className="relative bg-surface-card border-theme-card border-border-default shadow-theme-modal w-[400px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - Bauhaus风格 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 ${variant === 'danger' ? 'bg-status-offline' : 'bg-accent-warning'}`}></div>
            <span className="text-xs font-bold tracking-widest text-content-secondary">
              /// {variant === 'danger' ? 'WARNING' : 'CAUTION'}
            </span>
          </div>
          <button
            aria-label={t('close')}
            onClick={handleClose}
            disabled={isDeleting}
            className="w-6 h-6 flex items-center justify-center border-theme-button border-border-default hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="p-6 space-y-5">
          {/* 警告图标 */}
          <div className="flex justify-center">
            <div className={`w-16 h-16 border-theme-card flex items-center justify-center ${
              variant === 'danger'
                ? 'border-status-offline bg-status-offline/10'
                : 'border-accent-warning bg-accent-warning/10'
            }`}>
              {variant === 'danger' ? (
                <AlertTriangle className="w-8 h-8 text-status-offline" />
              ) : (
                <Trash2 className="w-8 h-8 text-accent-warning" />
              )}
            </div>
          </div>

          {/* 标题和描述 */}
          <div className="text-center space-y-3">
            <h2 id="delete-confirm-title" className="text-lg font-black tracking-tight text-content-primary">
              {title || t('confirmDeleteTitle')}
            </h2>
            {itemName && (
              <div className={`text-sm font-bold border-theme-card py-2 px-4 inline-block ${
                variant === 'danger'
                  ? 'text-status-offline border-status-offline/30 bg-status-offline/10'
                  : 'text-accent-warning border-accent-warning/30 bg-accent-warning/10'
              }`}>
                {itemName}
              </div>
            )}
            <p className="text-xs text-content-secondary leading-relaxed">
              {description || t('confirmDeleteDescription')}
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-0 border-t-2 border-border-default">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="flex-1 py-3 text-sm font-bold border-r border-border-divider hover:bg-surface-page transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className={`flex-1 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-status-offline text-content-inverted hover:bg-status-offline/90'
                : 'bg-accent-warning text-content-inverted hover:bg-accent-warning/90'
            }`}
          >
            {isDeleting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin"></span>
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
