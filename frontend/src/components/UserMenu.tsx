import { Button } from '@/components/ui/button'
import { planLevels } from '@/data/plans'
import { useTranslation } from '@/i18n'

interface UserMenuProps {
  userName: string
  truncatedUserName: string
}

export default function UserMenu({ userName: _userName, truncatedUserName }: UserMenuProps) {
  const { t } = useTranslation()

  return (
    <div className="relative group">
      <div className="flex items-center gap-2 cursor-pointer">
        <div className="w-8 h-8 rounded-full bg-cashmere-border flex items-center justify-center shadow-inner shadow-cashmere-border dark:bg-ai-primary-dark transition">
          <span className="text-cashmere-text text-sm font-medium dark:text-ai-text-light">U</span>
        </div>
        <span className="max-w-[72px] text-sm font-semibold text-cashmere-text dark:text-ai-text-light overflow-hidden text-ellipsis whitespace-nowrap">
          {truncatedUserName}
        </span>
      </div>
      <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 absolute top-full mt-2 right-0 sm:left-auto left-1/2 sm:-translate-x-0 -translate-x-1/2 w-64 max-w-[90vw] rounded-[1.25rem] border border-cashmere-border bg-white/90 text-cashmere-text shadow-[0_10px_30px_rgba(74,55,40,0.1)] backdrop-blur-xl">
        <div className="px-4 py-3 border-b border-cashmere-border flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cashmere-primary to-cashmere-hover flex items-center justify-center shadow-[0_10px_30px_rgba(74,55,40,0.1)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
            <span className="text-white font-bold">U</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-cashmere-text dark:text-ai-text-light">XPouch User</p>
            <p className="text-[11px] uppercase tracking-[0.4em] text-cashmere-muted dark:text-ai-text-light">
              {t('currentPlan')}
            </p>
          </div>
        </div>
        {/* 下拉菜单遵循 light/dark 对比：浅色用 warm glass，深色直接使用 ai 主题浅文本 */}
        <div className="px-4 py-3 space-y-2">
          {planLevels.map((plan) => (
            <div
              key={plan.tier}
              className="rounded-xl border border-transparent bg-cashmere-page/60 px-3 py-2 text-xs text-cashmere-muted transition hover:border-cashmere-border hover:bg-cashmere-page/80 dark:border-ai-card-dark/70 dark:bg-ai-card-dark/80 dark:text-ai-text-light dark:hover:border-ai-primary-light dark:hover:bg-ai-card-dark/70"
            >
              <p className="text-sm font-semibold text-cashmere-text dark:text-ai-text-light">
                {plan.tier}
              </p>
              <p className="text-[11px] leading-tight text-cashmere-muted dark:text-ai-text-light/80">
                {plan.description}
              </p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 pt-1">
          <Button
            variant="outline"
            className="w-full justify-center border-cashmere-border text-xs text-white uppercase tracking-[0.35em]"
          >
            {t('personalSettings')}
          </Button>
        </div>
      </div>
    </div>
  )
}
