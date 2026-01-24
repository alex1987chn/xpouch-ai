import { useState } from 'react'
import {
  Dialog,
  DialogContentCentered,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'

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
      console.error('Delete failed:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContentCentered className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <DialogTitle className="text-center">{title || t('confirmDeleteTitle')}</DialogTitle>
          {itemName && (
            <DialogDescription className="text-center">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                "{itemName}"
              </span>
            </DialogDescription>
          )}
          <DialogDescription className="text-center">
            {description || t('confirmDeleteDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:w-auto"
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="w-full sm:w-auto"
          >
            {isDeleting ? t('deleting') : t('confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContentCentered>
    </Dialog>
  )
}
