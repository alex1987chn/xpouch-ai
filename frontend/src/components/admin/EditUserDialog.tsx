/**
 * EditUserDialog - 用户编辑弹窗（管理员）
 *
 * 三区：资料（用户名/邮箱/手机号）· 角色（双档 radio，自己不可改）
 * · 重置密码（自定义 / 系统随机；随机明文仅展示一次，需复制交付，
 *   不走短信——凭据进运营商/终端留痕是安全反模式，见 REDESIGN-NOTES 增补 5）。
 * 外壳复用 ModalShell；保存走 PATCH，重置密码独立按钮即时生效。
 */

import { useState, useEffect } from 'react'
import { useTranslation } from '@/i18n'
import { X, Copy, Check, KeyRound, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-shell'
import { pushToast } from '@/components/ui/use-toast'
import {
  updateAdminUser, resetAdminUserPassword, type AdminUser,
} from '@/services/admin'
import { cn } from '@/lib/utils'

interface EditUserDialogProps {
  open: boolean
  user: AdminUser | null
  /** 是否在编辑当前登录的管理员自己（角色编辑锁定） */
  isSelf: boolean
  onClose: () => void
  onSaved: (updated: AdminUser) => void
}

type ResetMode = 'custom' | 'random'

export function EditUserDialog({ open, user, isSelf, onClose, onSaved }: EditUserDialogProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [isSaving, setIsSaving] = useState(false)

  // 重置密码区
  const [resetMode, setResetMode] = useState<ResetMode>('random')
  const [newPassword, setNewPassword] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 打开时以目标用户复位
  useEffect(() => {
    if (open && user) {
      setUsername(user.username)
      setEmail(user.email ?? '')
      setRole(user.role === 'admin' ? 'admin' : 'user')
      setResetMode('random')
      setNewPassword('')
      setGeneratedPassword(null)
      setCopied(false)
    }
  }, [open, user])

  if (!user) return null

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updated = await updateAdminUser(user.id, {
        username: username.trim(),
        email: email.trim() || null,
        role,
      })
      pushToast({ title: t('userSaved') })
      onSaved(updated)
      onClose()
    } catch (error) {
      pushToast({ title: (error as Error).message || t('userSaveFailed'), variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetPassword = async () => {
    if (resetMode === 'custom' && newPassword.length < 8) {
      pushToast({ title: t('resetPasswordTooShort'), variant: 'destructive' })
      return
    }
    setIsResetting(true)
    setGeneratedPassword(null)
    try {
      const result = await resetAdminUserPassword(user.id, {
        mode: resetMode,
        password: resetMode === 'custom' ? newPassword : undefined,
      })
      if (result.generated && result.password) {
        setGeneratedPassword(result.password)
        pushToast({ title: t('resetPasswordOk') })
      } else {
        pushToast({ title: t('resetPasswordOk') })
        setNewPassword('')
      }
    } catch (error) {
      pushToast({ title: (error as Error).message || t('resetPasswordFailed'), variant: 'destructive' })
    } finally {
      setIsResetting(false)
    }
  }

  const handleCopyPassword = async () => {
    if (!generatedPassword) return
    try {
      await navigator.clipboard.writeText(generatedPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      pushToast({ title: t('copyFailed'), variant: 'destructive' })
    }
  }

  const ghostBtn = 'flex h-9 items-center gap-1.5 rounded-full border border-border-divider bg-surface-card px-4 text-[13px] font-medium text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50'
  const primaryBtn = 'flex h-9 items-center gap-1.5 rounded-full border border-border-divider bg-accent-brand px-5 text-[13px] font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none'
  const inputCls = 'w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-[13px] text-content-primary focus:border-border-focus focus:outline-none transition-colors'
  const modePill = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-xs transition-colors',
      active ? 'bg-surface-tint font-bold text-content-primary' : 'font-medium text-content-secondary hover:text-content-primary'
    )

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy="edit-user-title"
      dismissable={!isSaving && !isResetting}
      panelClassName="max-h-[82vh] w-[min(520px,94vw)] overflow-y-auto"
    >
      {/* 头部 */}
      <div className="flex items-center gap-2.5 border-b border-border-divider px-5 py-4">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-surface-tint text-xs font-bold text-content-primary">
          {(user.username || 'U').charAt(0).toUpperCase()}
        </span>
        <span id="edit-user-title" className="flex-1 truncate text-[14.5px] font-bold text-content-primary">
          {user.username}
        </span>
        <span className="text-nano text-content-muted">{user.id.slice(0, 8)}</span>
          <button
            onClick={onClose}
            title={t('close')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary"
          >
            <X className="h-4 w-4" />
          </button>
      </div>

      {/* 资料区 */}
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-micro font-bold text-content-secondary">{t('userNameLabel')}</span>
          <input value={username} onChange={e => setUsername(e.target.value)} className={inputCls} maxLength={50} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-micro font-bold text-content-secondary">{t('emailLabel')}</span>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            className={inputCls}
            maxLength={254}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border-divider bg-surface-page px-3 py-2">
          <span className="text-xs text-content-secondary">{t('phoneLabel')}</span>
          <span className="font-mono text-xs text-content-primary">{user.phone_masked || '—'}</span>
        </div>
      </div>

      {/* 角色区 */}
      <div className="flex flex-col gap-2 border-t border-border-divider px-5 py-4">
        <span className="text-micro font-bold text-content-secondary">{t('userRoleLabel')}</span>
        {isSelf ? (
          <p className="text-xs leading-relaxed text-content-muted">{t('selfRoleLockedHint')}</p>
        ) : (
          <div className="flex gap-2">
            {(['user', 'admin'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={cn(
                  'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border text-xs transition-all',
                  role === r
                    ? 'border-border-hover bg-surface-tint font-bold text-content-primary'
                    : 'border-border-default text-content-secondary hover:border-border-hover hover:text-content-primary'
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    role === r ? 'bg-accent-brand' : 'bg-content-muted/40'
                  )}
                />
                {r === 'admin' ? t('roleAdmin') : t('roleUser')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 重置密码区 */}
      <div className="flex flex-col gap-3 border-t border-border-divider px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-micro font-bold text-content-secondary">
            <KeyRound className="h-3 w-3" />
            {t('resetPasswordLabel')}
          </span>
          <div className="flex h-7 items-center overflow-hidden rounded-full border border-border-divider" role="group">
            <button onClick={() => { setResetMode('random'); setGeneratedPassword(null) }} className={cn('flex h-full items-center px-3 text-xs', modePill(resetMode === 'random'))}>
              {t('resetModeRandom')}
            </button>
            <button onClick={() => { setResetMode('custom'); setGeneratedPassword(null) }} className={cn('flex h-full items-center px-3 text-xs', modePill(resetMode === 'custom'))}>
              {t('resetModeCustom')}
            </button>
          </div>
        </div>

        {resetMode === 'custom' ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={t('resetCustomPlaceholder')}
              className={inputCls}
              maxLength={64}
            />
            <button onClick={handleResetPassword} disabled={isResetting || newPassword.length < 8} className={cn(ghostBtn, 'shrink-0')}>
              {isResetting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('resetApply')}
            </button>
          </div>
        ) : (
          <button onClick={handleResetPassword} disabled={isResetting} className={cn(ghostBtn, 'self-start')}>
            {isResetting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t('resetGenerate')}
          </button>
        )}
        <p className="text-[11px] leading-relaxed text-content-muted">
          {generatedPassword ? t('resetDeliverHint') : t('resetModeHint')}
        </p>

        {generatedPassword && (
          <div className="flex items-center gap-2 rounded-md border border-accent-warning/30 bg-accent-warning/[0.08] px-3 py-2.5">
            <span className="flex-1 font-mono text-[13px] font-bold text-content-primary">{generatedPassword}</span>
            <button
              onClick={handleCopyPassword}
              title={t('copy')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-divider bg-surface-card text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-accent-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* 底部 */}
      <div className="flex items-center justify-end gap-2.5 border-t border-border-divider px-5 py-3.5">
        <button onClick={onClose} disabled={isSaving} className={ghostBtn}>
          {t('cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !username.trim()}
          className={primaryBtn}
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('save')}
        </button>
      </div>
    </ModalShell>
  )
}

export default EditUserDialog
