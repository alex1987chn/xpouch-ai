/**
 * DeleteConfirmDialog - 删除确认对话框
 * 
 * [职责]
 * 专家删除操作的二次确认弹窗
 */

import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import type { SystemExpert } from '@/services/admin'

interface DeleteConfirmDialogProps {
  isOpen: boolean
  expert: SystemExpert | null
  isDeleting: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function DeleteConfirmDialog({
  isOpen,
  expert,
  isDeleting,
  onConfirm,
  onClose,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation()

  if (!isOpen || !expert) return null

  return createPortal(
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-content-primary/50 z-50"
        onClick={!isDeleting ? onClose : undefined}
      />
      {/* 对话框容器 */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md border-2 border-border-default bg-surface-card shadow-hard z-50">
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-status-offline" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {t('confirmDeleteExpert')}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="w-7 h-7 flex items-center justify-center border border-border-default hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4">
          <p className="font-mono text-sm text-content-primary">
            {t('deleteExpertWarning').replace('{name}', expert.name)}
          </p>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t-2 border-border-default">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 border-2 border-border-default bg-surface-page font-mono text-xs font-bold uppercase hover:bg-accent-hover hover:text-content-primary transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-2 border-status-offline',
              'bg-status-offline text-content-primary font-mono text-xs font-bold uppercase',
              'shadow-[rgb(var(--shadow-color))_2px_2px_0_0]',
              'hover:bg-status-offline/80 hover:border-status-offline/80',
              'active:translate-x-[0px] active:translate-y-[0px] active:shadow-none',
              'transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isDeleting ? (
              <>
                <div className="w-3 h-3 border-2 border-content-primary/30 border-t-content-primary animate-spin" />
                {t('deleting')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {t('delete')}
              </>
            )}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
