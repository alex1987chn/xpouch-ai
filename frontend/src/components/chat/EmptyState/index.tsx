/**
 * 空状态组件
 * 当没有消息时显示的初始状态
 */

import { Terminal } from 'lucide-react'
import { useTranslation } from '@/i18n'

export default function EmptyState() {
  const { t } = useTranslation()

  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 border-2 border-dashed border-border/60 flex items-center justify-center mb-4 text-primary/60">
        <Terminal className="w-8 h-8" />
      </div>
      <p className="font-mono text-xs uppercase tracking-widest text-primary/70 dark:text-primary/60">
        {t('initConversation')}
      </p>
    </div>
  )
}
