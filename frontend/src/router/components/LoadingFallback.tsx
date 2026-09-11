/**
 * 路由加载中状态组件（柔和形态：口袋标脉冲 + 文案）
 */
import { useTranslation } from '@/i18n'

export function LoadingFallback() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-page">
      <div className="flex flex-col items-center gap-3">
        <div className="h-5 w-5 animate-pulse rounded-[50%_50%_50%_0] bg-accent-brand" />
        <span className="text-xs text-content-muted">{t('loading') || 'Loading…'}</span>
      </div>
    </div>
  )
}
