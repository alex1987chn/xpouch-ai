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
        <label className="text-xs font-bold text-content-secondary">
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
          className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2.5 text-sm text-content-primary transition-colors focus:border-border-focus focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-content-secondary">
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
            className="flex-1 rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2.5 font-display text-sm tracking-[0.2em] text-content-primary focus:border-border-focus"
          />
          <button
            onClick={onSendCode}
            disabled={
              !phoneNumber || phoneNumber.length !== 11 || (countdown > 0 && !debugCode) || loading
            }
            className="whitespace-nowrap rounded-full border border-border-divider bg-surface-card px-3.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary disabled:opacity-50"
          >
            {countdown > 0 ? `${countdown}s` : t('sendCode')}
          </button>
        </div>
        <div className="text-nano text-content-muted">
          {t('resetSendHint')}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-content-secondary">
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
          className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2.5 text-sm text-content-primary transition-colors focus:border-border-focus focus:outline-none"
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full rounded-full border border-border-divider bg-accent-brand py-2.5 text-sm font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card active:translate-y-0 active:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {loading ? 'RESETTING...' : t('resetPasswordAction')}
      </button>

      <div className="text-center">
        <button
          onClick={onBack}
          disabled={loading}
          className="text-[11.5px] text-content-muted hover:text-content-primary transition-colors underline underline-offset-2"
        >
          {t('backToLogin')}
        </button>
      </div>

      {/* 开发环境显示验证码 */}
      {import.meta.env.DEV && debugCode && (
        <div className="p-3 rounded-md border border-accent-brand/30 bg-accent-brand/10">
          <div className="text-[11.5px] font-medium text-content-primary">
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
