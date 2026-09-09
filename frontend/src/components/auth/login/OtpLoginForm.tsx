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
  'w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors rounded-md'
const SUBMIT_CLS =
  'w-full py-3 border-2 border-border-default bg-accent-hover text-content-primary font-bold font-mono text-sm uppercase shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-md'

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
          <label className="font-mono text-micro font-bold uppercase text-content-secondary">
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

        <div className="text-center font-mono text-micro text-content-secondary opacity-60">
          {t('autoRegisterHint')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="font-mono text-micro font-bold uppercase text-content-secondary">
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
          className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-lg text-center tracking-[0.3em] focus:outline-none focus:border-accent-hover transition-colors rounded-md"
        />
        <div className="font-mono text-nano text-content-secondary opacity-50">
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
          className="flex-1 py-2 border-2 border-border-default bg-surface-card font-mono text-xs uppercase hover:bg-surface-page transition-colors disabled:opacity-50 rounded-md"
        >
          {countdown > 0 ? `${countdown}s` : t('resend')}
        </button>

        <button
          onClick={() => onStepChange('phone')}
          disabled={loading}
          className="flex-1 py-2 border-2 border-border-default bg-surface-card font-mono text-xs uppercase text-content-secondary hover:bg-surface-page transition-colors rounded-md"
        >
          {t('changePhone')}
        </button>
      </div>

      {/* 开发环境显示验证码 */}
      {import.meta.env.DEV && countdown > 0 && (
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
