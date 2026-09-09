/**
 * =============================
 * SettingsHubDialog - 设置中心 (Portal)
 * =============================
 *
 * 原先三个独立弹窗（个人设置 / 模型配置 / 账号与安全）整合为一个
 * 分区弹窗：顶部三分段 tab 定位，入口仍保留三个 open* 动作映射到
 * 对应初始分区（appUIStore）。
 * 各分区自带保存语义：profile/model 显式保存，security 动作即时生效。
 */

import { createPortal } from 'react-dom'
import { User, Cpu, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useAppUIStore, type SettingsSection } from '@/store/appUIStore'
import { Z_INDEX } from '@/constants/zIndex'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import { ProfileSection } from '@/components/settings/sections/ProfileSection'
import { ModelSection } from '@/components/settings/sections/ModelSection'
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
    { key: 'model', label: t('modelConfig'), icon: Cpu },
    { key: 'security', label: t('accountSecurity'), icon: ShieldCheck },
  ]

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={closeSettings}
    >
      <div
        {...a11y}
        className="relative bg-surface-card border-2 border-border-default shadow-theme-modal w-[600px] max-w-[90vw] max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
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

        {/* 分区 tab（分段控件样式，与思考开关一致） */}
        <div role="tablist" className="grid grid-cols-3 border-b-2 border-border-default shrink-0">
          {tabs.map(({ key, label, icon: Icon }, index) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={section === key}
              onClick={() => setSettingsSection(key)}
              className={cn(
                'flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase transition-colors',
                index > 0 && 'border-l-2 border-border-default',
                section === key
                  ? 'bg-accent-hover/10 text-content-primary'
                  : 'text-content-secondary hover:bg-surface-page'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* 分区内容：仅挂载当前分区，切换即重置该分区编辑态 */}
        {section === 'profile' && <ProfileSection onClose={closeSettings} />}
        {section === 'model' && <ModelSection onClose={closeSettings} />}
        {section === 'security' && <SecuritySection />}
      </div>
    </div>,
    document.body
  )
}
