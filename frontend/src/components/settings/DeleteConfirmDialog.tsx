import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { logger } from '@/utils/logger'

interface DeleteConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  title?: string
  description?: string
  itemName?: string
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      logger.error('Delete failed:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
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
        className="relative bg-surface-card border-2 border-border-default shadow-hard-xl w-[400px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - Bauhaus风格 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// WARNING
            </span>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="w-6 h-6 flex items-center justify-center border border-border-default hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="p-6 space-y-5">
          {/* 警告图标 */}
          <div className="flex justify-center">
            <div className="w-16 h-16 border-2 border-red-500 bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>

          {/* 标题和描述 */}
          <div className="text-center space-y-3">
            <h2 className="text-lg font-black uppercase tracking-tight text-content-primary">
              {title || t('confirmDeleteTitle')}
            </h2>
            {itemName && (
              <div className="font-mono text-sm font-bold text-red-500 border-2 border-red-500/30 bg-red-500/10 py-2 px-4 inline-block">
                {itemName}
              </div>
            )}
            <p className="text-xs font-mono text-content-secondary leading-relaxed">
              {description || t('confirmDeleteDescription')}
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-0 border-t-2 border-border-default">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="flex-1 py-3 font-mono text-sm font-bold uppercase border-r-2 border-border-default hover:bg-surface-page transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 py-3 bg-red-500 text-white font-mono text-sm font-bold uppercase hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin"></span>
                {t('deleting')}
              </span>
            ) : (
              t('confirmDelete')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
