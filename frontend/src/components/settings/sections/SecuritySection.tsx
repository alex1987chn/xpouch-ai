/**
 * 账号与安全分区（设置中心）。
 * 原 SecuritySettingsDialog 正文：密码设置表单，动作即时保存（无全局保存键）。
 */

import { useState, useEffect } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useUserStore } from '@/store/userStore'
import { pushToast } from '@/components/ui/use-toast'
import { setPasswordApi } from '@/services/auth'
import { useTranslation } from '@/i18n'

export function SecuritySection() {
  const { t } = useTranslation()
  const { user } = useUserStore()

  const [newPassword, setNewPassword] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [isSettingPassword, setIsSettingPassword] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)

  useEffect(() => {
    if (user) {
      setHasPassword(Boolean((user as { has_password?: boolean }).has_password))
      setNewPassword('')
      setOldPassword('')
    }
  }, [user])

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      pushToast({ title: t('passwordMinLength') })
      return
    }
    if (hasPassword && !oldPassword) {
      pushToast({ title: t('oldPasswordRequired') })
      return
    }

    setIsSettingPassword(true)
    try {
      await setPasswordApi(newPassword, hasPassword ? oldPassword : undefined)
      pushToast({ title: t('passwordSaved') })
      setHasPassword(true)
      setNewPassword('')
      setOldPassword('')
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'destructive' })
    } finally {
      setIsSettingPassword(false)
    }
  }

  const canSubmit =
    newPassword.length >= 8 && (!hasPassword || Boolean(oldPassword)) && !isSettingPassword

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
      {/* 密码设置 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-content-secondary" />
          <span className="text-xs font-bold text-content-secondary">
            {t('passwordSetup')}
          </span>
        </div>

        <div className="space-y-3">
          {hasPassword && (
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder={t('oldPasswordPlaceholder')}
              disabled={isSettingPassword}
              className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2.5 text-sm transition-colors focus:border-border-focus focus:outline-none"
            />
          )}
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) {
                handleSetPassword()
              }
            }}
            placeholder={t('newPasswordPlaceholder')}
            disabled={isSettingPassword}
            className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2.5 text-sm transition-colors focus:border-border-focus focus:outline-none"
          />
          <p className="text-[11.5px] text-content-muted">
            {t('accountSecurityDesc')}
          </p>
          <button
            onClick={handleSetPassword}
            disabled={!canSubmit}
            className="rounded-full border border-border-divider bg-accent-brand px-5 py-2 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
          >
            {isSettingPassword ? t('passwordSaving') : t('passwordSaveAction')}
          </button>
        </div>
      </section>
    </div>
  )
}
