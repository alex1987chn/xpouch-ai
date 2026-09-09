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
  'w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors rounded-md'

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
        <label className="font-mono text-micro font-bold uppercase text-content-secondary">
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
        <label className="font-mono text-micro font-bold uppercase text-content-secondary">
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
        className="w-full py-3 border-2 border-border-default bg-accent-hover text-content-primary font-bold font-mono text-sm uppercase shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
      >
        {loading ? 'SIGNING...' : '登录 / LOGIN'}
      </button>

      <div className="flex justify-between items-center font-mono text-micro text-content-secondary">
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
