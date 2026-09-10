/**
 * =============================
 * SettingsHubDialog - 设置中心 (Portal)
 * =============================
 *
 * 桌面端：左侧导航栏（148px，可随分区扩展）+ 右侧内容区，固定高度壳体。
 * 移动端：左栏塌为顶部三分段条。分区内容仅挂载当前项，切换带淡入过渡。
 * 各分区自带保存语义：profile/model 显式保存（model 仅管理员），security
 * 动作即时生效。
 */

import { createPortal } from 'react-dom'
import { User, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useAppUIStore, type SettingsSection } from '@/store/appUIStore'
import { Z_INDEX } from '@/constants/zIndex'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import { ProfileSection } from '@/components/settings/sections/ProfileSection'
import { SecuritySection } from '@/components/settings/sections/SecuritySection'

export function SettingsHubDialog() {
  const { t } = useTranslation()
  const isOpen = useAppUIStore((s) => s.settingsHubOpen)
  const section = useAppUIStore((s) => s.settingsHubSection)
  const closeSettings = useAppUIStore((s) => s.closeSettings)
  const setSettingsSection = useAppUIStore((s) => s.setSettingsSection)

  useEscapeToClose(isOpen, closeSettings)
  const a11y = useDialogA11y<HTMLDivElement>(isOpen, 'settings-hub-title')

  if (!isOpen) return null

  const tabs: { key: SettingsSection; label: string; icon: typeof User }[] = [
    { key: 'profile', label: t('userConfig'), icon: User },
    { key: 'security', label: t('accountSecurity'), icon: ShieldCheck },
  ]

  const renderTabButton = ({ key, label, icon: Icon }: (typeof tabs)[number]) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={section === key}
      onClick={() => setSettingsSection(key)}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 text-xs font-bold uppercase border-2 transition-colors',
        section === key
          ? 'bg-accent-hover border-accent-hover text-content-primary'
          : 'bg-transparent border-transparent text-content-secondary hover:bg-surface-page hover:border-border-default'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={closeSettings}
    >
      <div
        {...a11y}
        className="relative bg-surface-card border-2 border-border-default shadow-theme-modal w-[680px] max-w-[90vw] h-[600px] max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - Bauhaus风格 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-hover"></div>
            <span id="settings-hub-title" className="text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {t('settings')}
            </span>
          </div>
          <button
            aria-label={t('close')}
            onClick={closeSettings}
            className="w-6 h-6 flex items-center justify-center border-2 border-border-default hover:bg-accent-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 移动端分区条（sm 以下替代左栏） */}
        <div role="tablist" className="grid border-b-2 border-border-default shrink-0 sm:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(renderTabButton)}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* 桌面端左侧导航栏 */}
          <div role="tablist" className="hidden sm:flex sm:flex-col w-[148px] shrink-0 border-r-2 border-border-default p-2 gap-1">
            {tabs.map(renderTabButton)}
          </div>

          {/* 分区内容：固定高度外壳 + key 触发淡入，切换分区壳体不跳动；
              仅挂载当前分区，切换即重置该分区编辑态 */}
          <div
            key={section}
            className="flex-1 min-h-0 flex flex-col animate-in fade-in duration-150"
          >
            {section === 'profile' && <ProfileSection onClose={closeSettings} />}
            {section === 'security' && <SecuritySection />}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
