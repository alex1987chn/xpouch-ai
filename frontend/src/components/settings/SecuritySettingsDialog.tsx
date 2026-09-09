/**
 * =============================
 * SecuritySettingsDialog - 账号与安全弹窗 (Portal)
 * =============================
 *
 * 登录凭证类操作的独立入口（档位二：资料与安全分离）。
 * 与个人设置弹窗不同：这里的表单即时保存（每个动作一个按钮），
 * 不存在与全局「保存」的语义混淆。
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck, X } from 'lucide-react'
import { useUserStore } from '@/store/userStore'
import { pushToast } from '@/components/ui/use-toast'
import { setPasswordApi } from '@/services/auth'
import { useTranslation } from '@/i18n'
import { Z_INDEX } from '@/constants/zIndex'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useDialogA11y } from '@/hooks/useDialogA11y'

interface SecuritySettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SecuritySettingsDialog({ isOpen, onClose }: SecuritySettingsDialogProps) {
  const { t } = useTranslation()
  const { user } = useUserStore()

  const [newPassword, setNewPassword] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [isSettingPassword, setIsSettingPassword] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)

  useEffect(() => {
    if (isOpen && user) {
      setHasPassword(Boolean((user as { has_password?: boolean }).has_password))
      setNewPassword('')
      setOldPassword('')
    }
  }, [isOpen, user])

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

  const handleClose = () => {
    if (!isSettingPassword) {
      onClose()
    }
  }

  useEscapeToClose(isOpen, handleClose)
  const a11y = useDialogA11y<HTMLDivElement>(isOpen, 'security-settings-title')

  if (!isOpen) return null

  const canSubmit =
    newPassword.length >= 8 && (!hasPassword || Boolean(oldPassword)) && !isSettingPassword

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={handleClose}
    >
      <div
        {...a11y}
        className="relative bg-surface-card border-2 border-border-default shadow-theme-modal w-[420px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - 与 PersonalSettingsDialog 统一 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-hover"></div>
            <span id="security-settings-title" className="text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {t('accountSecurity')}
            </span>
          </div>
          <button
            aria-label={t('close')}
            onClick={handleClose}
            disabled={isSettingPassword}
            className="w-6 h-6 flex items-center justify-center border-2 border-border-default hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="px-5 py-5 space-y-4">
          {/* 密码设置 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-content-secondary" />
              <span className="text-micro font-bold uppercase tracking-widest text-content-secondary">
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
                  className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors"
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
                className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors"
              />
              <p className="text-micro text-content-secondary opacity-60">
                {t('accountSecurityDesc')}
              </p>
              <button
                onClick={handleSetPassword}
                disabled={!canSubmit}
                className="px-4 py-2 border-2 border-border-default bg-accent-hover text-content-primary text-xs font-bold uppercase hover:brightness-95 transition-colors disabled:opacity-50"
              >
                {isSettingPassword ? t('passwordSaving') : t('passwordSaveAction')}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  )
}
