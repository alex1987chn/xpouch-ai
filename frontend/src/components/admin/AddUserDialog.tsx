/**
 * AddUserDialog - 管理员添加用户弹窗
 *
 * 手机号 = 登录身份（OTP 验证码登录），必填且全局唯一。
 * 初始密码三态：不设置（验证码登录）/ 自定义（≥8 位）/ 系统随机
 * （明文仅展示一次，复制后经可信渠道交付——与重置密码同一交付约定）。
 * 头部右上角关闭钮与全站弹窗统一。
 */

import { useState } from 'react'
import { useTranslation } from '@/i18n'
import { X, Copy, Check, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-shell'
import { pushToast } from '@/components/ui/use-toast'
import { createAdminUser } from '@/services/admin'
import { cn } from '@/lib/utils'

interface AddUserDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

type PwdMode = 'none' | 'custom' | 'random'

export function AddUserDialog({ open, onClose, onCreated }: AddUserDialogProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [pwdMode, setPwdMode] = useState<PwdMode>('none')
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [createdPwd, setCreatedPwd] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setUsername('')
    setPhone('')
    setEmail('')
    setRole('user')
    setPwdMode('none')
    setPassword('')
    setCreatedPwd(null)
    setCopied(false)
  }

  const handleClose = () => {
    onClose()
    // 关闭时若已完成创建则复位表单（随机密码场景的"完成"亦走此）
    if (createdPwd !== null) reset()
  }

  const canSubmit = username.trim().length > 0 && phone.trim().length >= 5 &&
    (pwdMode !== 'custom' || password.length >= 8) && createdPwd === null

  const handleCreate = async () => {
    setIsSaving(true)
    try {
      const result = await createAdminUser({
        username: username.trim(),
        phone_number: phone.trim(),
        email: email.trim() || null,
        role,
        initial_password: pwdMode === 'custom' ? password : undefined,
        generate_random_password: pwdMode === 'random',
      })
      if (result.generated_password) {
        setCreatedPwd(result.generated_password)
        onCreated()
      } else {
        pushToast({ title: t('userCreated') })
        onCreated()
        reset()
        onClose()
      }
    } catch (error) {
      pushToast({ title: (error as Error).message || t('userCreateFailed'), variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyPassword = async () => {
    if (!createdPwd) return
    try {
      await navigator.clipboard.writeText(createdPwd)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      pushToast({ title: t('copyFailed'), variant: 'destructive' })
    }
  }

  const inputCls = 'w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-[13px] text-content-primary focus:border-border-focus focus:outline-none transition-colors'
  const modePill = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-xs transition-colors',
      active ? 'bg-surface-tint font-bold text-content-primary' : 'font-medium text-content-secondary hover:text-content-primary'
    )

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      labelledBy="add-user-title"
      dismissable={!isSaving}
      panelClassName="max-h-[82vh] w-[min(520px,94vw)] overflow-y-auto"
    >
      {/* 头部 */}
      <div className="flex items-center gap-2.5 border-b border-border-divider px-5 py-4">
        <span id="add-user-title" className="flex-1 text-[14.5px] font-bold text-content-primary">
          {t('addUser')}
        </span>
        <button
          onClick={handleClose}
          title={t('close')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {createdPwd ? (
        /* 随机初始密码展示（仅一次） */
        <div className="flex flex-col gap-3 px-5 py-5">
          <p className="text-[12.5px] leading-relaxed text-content-secondary">{t('userCreated')}</p>
          <div className="flex items-center gap-2 rounded-md border border-accent-warning/30 bg-accent-warning/[0.08] px-3 py-2.5">
            <span className="flex-1 font-mono text-[13px] font-bold text-content-primary">{createdPwd}</span>
            <button
              onClick={handleCopyPassword}
              title={t('copy')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-divider bg-surface-card text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-accent-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-content-muted">{t('resetDeliverHint')}</p>
          <button
            onClick={handleClose}
            className="self-end rounded-full border border-border-divider bg-accent-brand px-5 py-1.5 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card"
          >
            {t('finishEdit')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-micro font-bold text-content-secondary">{t('userNameLabel')}</span>
              <input value={username} onChange={e => setUsername(e.target.value)} className={inputCls} maxLength={50} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-micro font-bold text-content-secondary">{t('phoneLabel')}</span>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder={t('phonePlaceholder')}
                className={inputCls}
                maxLength={32}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-micro font-bold text-content-secondary">{t('emailLabel')}</span>
              <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} maxLength={254} />
            </div>
          </div>

          {/* 角色 */}
          <div className="flex flex-col gap-2 border-t border-border-divider px-5 py-4">
            <span className="text-micro font-bold text-content-secondary">{t('userRoleLabel')}</span>
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
                  <span className={cn('h-2 w-2 rounded-full', role === r ? 'bg-accent-brand' : 'bg-content-muted/40')} />
                  {r === 'admin' ? t('roleAdmin') : t('roleUser')}
                </button>
              ))}
            </div>
          </div>

          {/* 初始密码三态 */}
          <div className="flex flex-col gap-2.5 border-t border-border-divider px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-micro font-bold text-content-secondary">{t('initialPasswordLabel')}</span>
              <div className="flex h-7 items-center overflow-hidden rounded-full border border-border-divider" role="group">
                <button onClick={() => setPwdMode('none')} className={cn('flex h-full items-center px-3 text-xs', modePill(pwdMode === 'none'))}>
                  {t('pwdModeNone')}
                </button>
                <button onClick={() => setPwdMode('random')} className={cn('flex h-full items-center px-3 text-xs', modePill(pwdMode === 'random'))}>
                  {t('pwdModeRandom')}
                </button>
                <button onClick={() => setPwdMode('custom')} className={cn('flex h-full items-center px-3 text-xs', modePill(pwdMode === 'custom'))}>
                  {t('pwdModeCustom')}
                </button>
              </div>
            </div>
            {pwdMode === 'custom' && (
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('resetCustomPlaceholder')}
                className={inputCls}
                maxLength={64}
              />
            )}
            <p className="text-[11px] leading-relaxed text-content-muted">{t('pwdNoneHint')}</p>
          </div>

          {/* 底部 */}
          <div className="flex items-center justify-end gap-2.5 border-t border-border-divider px-5 py-3.5">
            <button onClick={handleClose} disabled={isSaving} className="flex h-9 items-center rounded-full border border-border-divider bg-surface-card px-4 text-[13px] font-medium text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50">
              {t('cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!canSubmit || isSaving}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border-divider bg-accent-brand px-5 text-[13px] font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('addUser')}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}

export default AddUserDialog
