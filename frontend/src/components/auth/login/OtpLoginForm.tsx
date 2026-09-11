/**
 * 验证码登录表单（OTP）：手机号 → 验证码两步。
 * 纯展示组件：状态与提交逻辑由 LoginDialog 编排。
 */

import type { TranslationKey } from '@/i18n'

interface OtpLoginFormProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  step: 'phone' | 'code'
  phoneNumber: string
  code: string
  loading: boolean
  countdown: number
  debugCode: string
  onPhoneNumberChange: (value: string) => void
  onCodeChange: (value: string) => void
  onSendCode: () => void
  onVerify: () => void
  onStepChange: (step: 'phone' | 'code') => void
}

const INPUT_CLS =
  'w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2.5 text-sm text-content-primary transition-colors focus:border-border-focus focus:outline-none'
const SUBMIT_CLS =
  'w-full rounded-full border border-border-divider bg-accent-brand py-2.5 text-sm font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card active:translate-y-0 active:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none'

export function OtpLoginForm({
  t,
  step,
  phoneNumber,
  code,
  loading,
  countdown,
  debugCode,
  onPhoneNumberChange,
  onCodeChange,
  onSendCode,
  onVerify,
  onStepChange,
}: OtpLoginFormProps) {
  if (step === 'phone') {
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
            className={INPUT_CLS}
          />
        </div>

        <button
          onClick={onSendCode}
          disabled={!phoneNumber || phoneNumber.length !== 11 || loading}
          className={SUBMIT_CLS}
        >
          {loading ? 'SENDING...' : t('sendCode')}
        </button>

        <div className="text-center text-[11.5px] text-content-muted">
          {t('autoRegisterHint')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-bold text-content-secondary">
          VERIFICATION_CODE
        </label>
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('codePlaceholder')}
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
          disabled={loading}
          autoFocus
          className="w-full rounded-lg border-theme-input border-border-default bg-surface-page px-3 py-3 font-display text-lg text-center tracking-[0.3em] text-content-primary transition-colors focus:border-border-focus focus:outline-none"
        />
        <div className="text-nano text-content-muted">
          {t('codeSentTo', { phone: `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}` })}
        </div>
      </div>

      <button onClick={onVerify} disabled={!code || code.length < 4 || loading} className={SUBMIT_CLS}>
        {loading ? 'VERIFYING...' : '登录 / LOGIN'}
      </button>

      <div className="flex gap-2">
        <button
          onClick={onSendCode}
          disabled={countdown > 0 || loading}
          className="flex-1 py-2 border-theme-button border-border-default bg-surface-card font-mono text-xs hover:bg-surface-page transition-colors disabled:opacity-50 rounded-md"
        >
          {countdown > 0 ? `${countdown}s` : t('resend')}
        </button>

        <button
          onClick={() => onStepChange('phone')}
          disabled={loading}
          className="flex-1 py-2 border-theme-button border-border-default bg-surface-card font-mono text-xs text-content-secondary hover:bg-surface-page transition-colors rounded-md"
        >
          {t('changePhone')}
        </button>
      </div>

      {/* 开发环境显示验证码 */}
      {import.meta.env.DEV && countdown > 0 && (
        <div className="p-3 rounded-md border border-accent-brand/30 bg-accent-brand/10">
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
