/**
 * 路由加载中状态组件（柔和形态：口袋标脉冲 + 文案）
 */
import { useTranslation } from '@/i18n'
import { The4DPocketLogo } from '@/components/brand'

export function LoadingFallback() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-page">
      <div className="flex flex-col items-center gap-2.5">
        <div className="h-[26px] w-[26px] overflow-visible">
          <span className="block origin-top-left scale-[0.62]">
            <The4DPocketLogo />
          </span>
        </div>
        <span className="text-xs text-content-muted">{t('loading') || 'Loading…'}</span>
      </div>
    </div>
  )
}
