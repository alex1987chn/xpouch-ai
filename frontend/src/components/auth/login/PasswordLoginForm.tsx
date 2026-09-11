/**
 * 密码登录表单：账号（手机号/邮箱）+ 密码。
 * 纯展示组件：状态与提交逻辑由 LoginDialog 编排。
 */

import type { TranslationKey } from '@/i18n'

interface PasswordLoginFormProps {
  t: (key: TranslationKey) => string
  identifier: string
  password: string
  loading: boolean
  onIdentifierChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void
  onForgotPassword: () => void
}

const INPUT_CLS =
  'w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2.5 text-sm text-content-primary transition-colors focus:border-border-focus focus:outline-none'

export function PasswordLoginForm({
  t,
  identifier,
  password,
  loading,
  onIdentifierChange,
  onPasswordChange,
  onSubmit,
  onForgotPassword,
}: PasswordLoginFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-bold text-content-secondary">
          {t('identifierLabel')}
        </label>
        <input
          type="text"
          placeholder={t('identifierPlaceholder')}
          value={identifier}
          onChange={(e) => onIdentifierChange(e.target.value)}
          disabled={loading}
          className={INPUT_CLS}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-content-secondary">
          PASSWORD
        </label>
        <input
          type="password"
          placeholder={t('passwordPlaceholder')}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && identifier.trim() && password && !loading) {
              onSubmit()
            }
          }}
          disabled={loading}
          className={INPUT_CLS}
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={!identifier.trim() || !password || loading}
        className="w-full rounded-full border border-border-divider bg-accent-brand py-2.5 text-sm font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card active:translate-y-0 active:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {loading ? 'SIGNING...' : '登录 / LOGIN'}
      </button>

      <div className="flex justify-between items-center text-[11.5px] text-content-muted">
        <button
          onClick={onForgotPassword}
          className="hover:text-content-primary transition-colors underline underline-offset-2"
        >
          {t('forgotPasswordLink')}
        </button>
        <span className="opacity-60">{t('passwordLoginHint')}</span>
      </div>
    </div>
  )
}
