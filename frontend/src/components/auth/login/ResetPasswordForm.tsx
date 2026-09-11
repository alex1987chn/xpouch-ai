/**
 * 重置密码表单（忘记密码流程）：手机号 + 验证码 + 新密码。
 * 纯展示组件：状态与提交逻辑由 LoginDialog 编排。
 */

import type { TranslationKey } from '@/i18n'

interface ResetPasswordFormProps {
  t: (key: TranslationKey) => string
  phoneNumber: string
  code: string
  resetPassword: string
  loading: boolean
  countdown: number
  debugCode: string
  onPhoneNumberChange: (value: string) => void
  onCodeChange: (value: string) => void
  onResetPasswordChange: (value: string) => void
  onSendCode: () => void
  onSubmit: () => void
  onBack: () => void
}

export function ResetPasswordForm({
  t,
  phoneNumber,
  code,
  resetPassword,
  loading,
  countdown,
  debugCode,
  onPhoneNumberChange,
  onCodeChange,
  onResetPasswordChange,
  onSendCode,
  onSubmit,
  onBack,
}: ResetPasswordFormProps) {
  const canSubmit =
    phoneNumber.length === 11 && code.length >= 4 && resetPassword.length >= 8 && !loading

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="font-mono text-micro font-bold text-content-secondary">
          PHONE_NUMBER
        </label>
        <input
          type="tel"
          placeholder={t('phoneNumberPlaceholder')}
          value={phoneNumber}
          onChange={(e) => onPhoneNumberChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
          maxLength={11}
          disabled={loading}
          autoFocus
          className="w-full px-3 py-2.5 border-theme-input border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors rounded-md"
        />
      </div>
      <div className="space-y-1">
        <label className="font-mono text-micro font-bold text-content-secondary">
          VERIFICATION_CODE
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder={t('codePlaceholder')}
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            disabled={loading}
            className="flex-1 px-3 py-2.5 border-theme-input border-border-default bg-surface-page font-mono text-sm tracking-[0.2em] focus:outline-none focus:border-accent-hover transition-colors rounded-md"
          />
          <button
            onClick={onSendCode}
            disabled={
              !phoneNumber || phoneNumber.length !== 11 || (countdown > 0 && !debugCode) || loading
            }
            className="px-3 border-theme-button border-border-default bg-surface-card font-mono text-xs hover:bg-surface-page transition-colors disabled:opacity-50 whitespace-nowrap rounded-md"
          >
            {countdown > 0 ? `${countdown}s` : t('sendCode')}
          </button>
        </div>
        <div className="font-mono text-nano text-content-secondary opacity-50">
          {t('resetSendHint')}
        </div>
      </div>
      <div className="space-y-1">
        <label className="font-mono text-micro font-bold text-content-secondary">
          {t('newPasswordLabel')}
        </label>
        <input
          type="password"
          placeholder={t('newPasswordPlaceholder')}
          value={resetPassword}
          onChange={(e) => onResetPasswordChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              onSubmit()
            }
          }}
          disabled={loading}
          className="w-full px-3 py-2.5 border-theme-input border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors rounded-md"
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full py-3 border-theme-button border-border-default bg-accent-hover text-accent-ink font-bold font-mono text-sm shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
      >
        {loading ? 'RESETTING...' : t('resetPasswordAction')}
      </button>

      <div className="text-center">
        <button
          onClick={onBack}
          disabled={loading}
          className="font-mono text-micro text-content-secondary hover:text-content-primary transition-colors underline underline-offset-2"
        >
          {t('backToLogin')}
        </button>
      </div>

      {/* 开发环境显示验证码 */}
      {import.meta.env.DEV && debugCode && (
        <div className="p-3 bg-accent-hover/10 border border-theme-card border-accent-hover rounded-md">
          <div className="font-mono text-micro text-content-primary">
            <div className="font-bold mb-1">🔧 DEV_MODE</div>
            <div>
              CODE: <span className="text-lg font-bold">{debugCode}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
