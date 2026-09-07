import { useState, useEffect } from 'react'
import { useTranslation } from '@/i18n'
import { createPortal } from 'react-dom'
import { The4DPocketLogo } from '@/components/bauhaus'
import { useUserStore } from '@/store/userStore'
import { logger } from '@/utils/logger'
import { pushToast } from '@/components/ui/use-toast'
import { Z_INDEX } from '@/constants/zIndex'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export default function LoginDialog({ open, onOpenChange, onSuccess }: LoginDialogProps) {
  const { t } = useTranslation()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [debugCode, setDebugCode] = useState('')
  const [loginMode, setLoginMode] = useState<'otp' | 'password'>('otp')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  const { sendVerificationCode, loginWithPhone, loginWithPassword } = useUserStore()

  // 验证码倒计时
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  // 发送验证码
  const handleSendCode = async () => {
    if (!phoneNumber || phoneNumber.length !== 11) {
      pushToast({ title: t('enterValidPhone') })
      return
    }

    setLoading(true)
    try {
      const response = await sendVerificationCode(phoneNumber)
      setStep('code')
      setCountdown(60) // 开始60秒倒计时
      // 开发环境保存验证码
      if (response._debug_code) {
        setDebugCode(response._debug_code)
      }
    } catch (error) {
      logger.error('发送验证码失败:', error)
      pushToast({ title: (error as Error).message })
    } finally {
      setLoading(false)
    }
  }

  // 验证验证码并登录
  const handleVerifyCode = async () => {
    if (!code || code.length < 4) {
      pushToast({ title: t('enterCode') })
      return
    }

    setLoading(true)
    try {
      await loginWithPhone(phoneNumber, code)

      // 延迟关闭弹窗，确保状态已更新
      setTimeout(() => {
        // 关闭弹窗
        onOpenChange(false)

        // 重置状态
        setPhoneNumber('')
        setCode('')
        setStep('phone')
        setCountdown(0)
        setDebugCode('')

        // 触发成功回调
        onSuccess?.()
      }, 100)
    } catch (error) {
      logger.error('[LoginDialog] 验证失败:', error)
      pushToast({ title: (error as Error).message })
    } finally {
      setLoading(false)
    }
  }

  // 密码登录
  const handlePasswordLogin = async () => {
    if (!identifier.trim() || !password) {
      pushToast({ title: t('accountAndPasswordRequired') })
      return
    }

    setLoading(true)
    try {
      await loginWithPassword(identifier.trim(), password)

      setTimeout(() => {
        onOpenChange(false)
        setIdentifier('')
        setPassword('')
        setLoading(false)
        onSuccess?.()
      }, 100)
    } catch (error) {
      logger.error('[LoginDialog] 密码登录失败:', error)
      pushToast({ title: (error as Error).message })
      setLoading(false)
    }
  }

  // 重置表单
  const handleReset = () => {
    setPhoneNumber('')
    setCode('')
    setStep('phone')
    setCountdown(0)
    setDebugCode('')
    setLoading(false)
  }

  // 关闭弹窗时重置
  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  useEscapeToClose(open, handleClose)

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={handleClose}
    >
      <div
        className="relative bg-surface-card border-2 border-border-default shadow-theme-modal w-[380px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200 rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-hover"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// AUTHENTICATION
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center border-2 border-border-default hover:bg-accent-hover transition-colors rounded"
          >
            <span className="text-xs font-bold">×</span>
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="p-6 space-y-5">
          {/* Logo和标题 */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-2 border-border-default bg-surface-page flex items-center justify-center rounded-md">
              <The4DPocketLogo />
            </div>
            <h2 className="text-lg font-black uppercase tracking-tight mb-1 text-content-primary">
              {step === 'phone' ? t('welcomeBack') : t('verifyIdentity')}
            </h2>
            <p className="text-xs font-mono text-content-secondary">
              {step === 'phone' ? 'WELCOME BACK' : 'VERIFY IDENTITY'}
            </p>
          </div>

          {/* 调试信息 */}
          {import.meta.env.DEV && (
            <div className="p-2 bg-surface-page border-2 border-border-default font-mono text-micro text-content-secondary rounded">
              <div>🔍 DEBUG_MODE</div>
              <div>STEP: {step}</div>
              <div>CODE: {debugCode || 'NONE'}</div>
              <div>TIMER: {countdown}s</div>
            </div>
          )}

          {/* 登录方式 Tab */}
          <div className="grid grid-cols-2 gap-0 border-2 border-border-default rounded-md overflow-hidden">
            <button
              onClick={() => setLoginMode('otp')}
              className={`py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                loginMode === 'otp'
                  ? 'bg-accent-hover text-content-primary'
                  : 'bg-surface-page text-content-secondary hover:bg-surface-page/60'
              }`}
            >
              {t('loginTabOtp')}
            </button>
            <button
              onClick={() => setLoginMode('password')}
              className={`py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                loginMode === 'password'
                  ? 'bg-accent-hover text-content-primary'
                  : 'bg-surface-page text-content-secondary hover:bg-surface-page/60'
              }`}
            >
              {t('passwordLoginTab')}
            </button>
          </div>

          {/* 密码登录表单 */}
          {loginMode === 'password' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="font-mono text-micro font-bold uppercase text-content-secondary">
                  {t('identifierLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('identifierPlaceholder')}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors rounded-md"
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
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && identifier.trim() && password && !loading) {
                      handlePasswordLogin()
                    }
                  }}
                  disabled={loading}
                  className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors rounded-md"
                />
              </div>

              <button
                onClick={handlePasswordLogin}
                disabled={!identifier.trim() || !password || loading}
                className="w-full py-3 border-2 border-border-default bg-accent-hover text-content-primary font-bold font-mono text-sm uppercase shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
              >
                {loading ? 'SIGNING...' : '登录 / LOGIN'}
              </button>

              <div className="text-center font-mono text-micro text-content-secondary opacity-60">
                {t('passwordLoginHint')}
              </div>
            </div>
          )}

          {/* 步骤1: 输入手机号（OTP） */}
          {loginMode === 'otp' && step === 'phone' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="font-mono text-micro font-bold uppercase text-content-secondary">
                  PHONE_NUMBER
                </label>
                <input
                  type="tel"
                  placeholder={t('phoneNumberPlaceholder')}
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  maxLength={11}
                  disabled={loading}
                  autoFocus
                  className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors rounded-md"
                />
              </div>

              <button
                onClick={handleSendCode}
                disabled={!phoneNumber || phoneNumber.length !== 11 || loading}
                className="w-full py-3 border-2 border-border-default bg-accent-hover text-content-primary font-bold font-mono text-sm uppercase shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
              >
                {loading ? 'SENDING...' : t('sendCode')}
              </button>

              <div className="text-center font-mono text-micro text-content-secondary opacity-60">
                {t('autoRegisterHint')}
              </div>
            </div>
          )}

          {/* 步骤2: 输入验证码 */}
          {loginMode === 'otp' && step === 'code' && (
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
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  disabled={loading}
                  autoFocus
                  className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-lg text-center tracking-[0.3em] focus:outline-none focus:border-accent-hover transition-colors rounded-md"
                />
                <div className="font-mono text-nano text-content-secondary opacity-50">
                  {t('codeSentTo', { phone: `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}` })}
                </div>
              </div>

              <button
                onClick={handleVerifyCode}
                disabled={!code || code.length < 4 || loading}
                className="w-full py-3 border-2 border-border-default bg-accent-hover text-content-primary font-bold font-mono text-sm uppercase shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
              >
                {loading ? 'VERIFYING...' : '登录 / LOGIN'}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading}
                  className="flex-1 py-2 border-2 border-border-default bg-surface-card font-mono text-xs uppercase hover:bg-surface-page transition-colors disabled:opacity-50 rounded-md"
                >
                  {countdown > 0 ? `${countdown}s` : t('resend')}
                </button>

                <button
                  onClick={() => setStep('phone')}
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
                    <div>CODE: <span className="text-lg font-bold">{debugCode}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
