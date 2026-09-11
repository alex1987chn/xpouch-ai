import { useState, useEffect } from 'react'
import { useTranslation } from '@/i18n'
import { createPortal } from 'react-dom'
import { The4DPocketLogo } from '@/components/bauhaus'
import { useUserStore } from '@/store/userStore'
import { logger } from '@/utils/logger'
import { pushToast } from '@/components/ui/use-toast'
import { resetPasswordApi } from '@/services/auth'
import { Z_INDEX } from '@/constants/zIndex'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import { OtpLoginForm } from './login/OtpLoginForm'
import { PasswordLoginForm } from './login/PasswordLoginForm'
import { ResetPasswordForm } from './login/ResetPasswordForm'

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
  const [loginMode, setLoginMode] = useState<'otp' | 'password' | 'reset'>('otp')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [resetPassword, setResetPassword] = useState('')

  const { sendVerificationCode, loginWithPhone, loginWithPassword } = useUserStore()

  // 验证码倒计时
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  // 发送验证码（重置密码用途：只发已注册手机号，不自动建号）
  const handleSendCode = async () => {
    if (!phoneNumber || phoneNumber.length !== 11) {
      pushToast({ title: t('enterValidPhone') })
      return
    }

    setLoading(true)
    try {
      const purpose = loginMode === 'reset' ? 'password_reset' : 'login'
      const response = await sendVerificationCode(phoneNumber, purpose)
      if (loginMode !== 'reset') {
        setStep('code')
      }
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

  // 重置密码（忘记密码流程）
  const handleResetPassword = async () => {
    if (!phoneNumber || phoneNumber.length !== 11 || code.length < 4) {
      pushToast({ title: t('enterValidPhone') })
      return
    }
    if (resetPassword.length < 8) {
      pushToast({ title: t('passwordMinLength') })
      return
    }

    setLoading(true)
    try {
      await resetPasswordApi(phoneNumber, code, resetPassword)
      pushToast({ title: t('passwordResetSuccess') })

      setTimeout(() => {
        // 回到密码登录并预填手机号，引导用新密码登录
        setLoginMode('password')
        setIdentifier(phoneNumber)
        setCode('')
        setResetPassword('')
        setCountdown(0)
        setDebugCode('')
        setLoading(false)
      }, 100)
    } catch (error) {
      logger.error('[LoginDialog] 重置密码失败:', error)
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
    setResetPassword('')
  }

  // 关闭弹窗时重置
  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  useEscapeToClose(open, handleClose)
  const a11y = useDialogA11y<HTMLDivElement>(open, 'login-dialog-title')

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-surface-scrim/60 flex items-center justify-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={handleClose}
    >
      <div
        {...a11y}
        className="relative bg-surface-card rounded-lg border-theme-card border-border-default shadow-theme-modal w-[380px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200 rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮（浮层右上） */}
        <button
          aria-label={t('close')}
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary"
        >
          <span className="text-base font-bold">×</span>
        </button>

        {/* 弹窗内容 */}
        <div className="p-6 space-y-5">
          {/* 品牌标 + 标题 */}
          <div className="text-center">
            <div className="mx-auto mb-2 flex h-[42px] w-[42px] items-center justify-center">
              <The4DPocketLogo />
            </div>
            <h2
              id="login-dialog-title"
              className="mb-0.5 text-[17px] font-bold text-content-primary"
            >
              {loginMode === 'reset'
                ? t('resetPasswordTitle')
                : step === 'phone'
                  ? t('welcomeBack')
                  : t('verifyIdentity')}
            </h2>
            <p className="text-xs text-content-muted">xpouch</p>
          </div>

          {/* 调试信息 */}
          {import.meta.env.DEV && (
            <div className="p-2 bg-surface-page border-theme-card border-border-default font-mono text-micro text-content-secondary rounded">
              <div>🔍 DEBUG_MODE</div>
              <div>STEP: {step}</div>
              <div>CODE: {debugCode || 'NONE'}</div>
              <div>TIMER: {countdown}s</div>
            </div>
          )}

          {/* 登录方式 Tab（reset 模式下无高亮，点任一 tab 退出重置流程） */}
          <div className="flex h-[34px] items-center overflow-hidden rounded-full border border-border-default bg-surface-page">
            <button
              onClick={() => setLoginMode('otp')}
              className={`h-full flex-1 text-xs transition-colors ${
                loginMode === 'otp'
                  ? 'bg-surface-tint font-bold text-content-primary'
                  : 'text-content-muted hover:text-content-primary'
              }`}
            >
              {t('loginTabOtp')}
            </button>
            <button
              onClick={() => setLoginMode('password')}
              className={`h-full flex-1 border-l border-border-divider text-xs transition-colors ${
                loginMode === 'password'
                  ? 'bg-surface-tint font-bold text-content-primary'
                  : 'text-content-muted hover:text-content-primary'
              }`}
            >
              {t('passwordLoginTab')}
            </button>
          </div>

          {/* 密码登录表单 */}
          {loginMode === 'password' && (
            <PasswordLoginForm
              t={t}
              identifier={identifier}
              password={password}
              loading={loading}
              onIdentifierChange={setIdentifier}
              onPasswordChange={setPassword}
              onSubmit={handlePasswordLogin}
              onForgotPassword={() => {
                handleReset()
                setLoginMode('reset')
              }}
            />
          )}

          {/* 重置密码视图（忘记密码） */}
          {loginMode === 'reset' && (
            <ResetPasswordForm
              t={t}
              phoneNumber={phoneNumber}
              code={code}
              resetPassword={resetPassword}
              loading={loading}
              countdown={countdown}
              debugCode={debugCode}
              onPhoneNumberChange={setPhoneNumber}
              onCodeChange={setCode}
              onResetPasswordChange={setResetPassword}
              onSendCode={handleSendCode}
              onSubmit={handleResetPassword}
              onBack={() => {
                handleReset()
                setLoginMode('password')
              }}
            />
          )}

          {/* 验证码登录（OTP） */}
          {loginMode === 'otp' && (
            <OtpLoginForm
              t={t}
              step={step}
              phoneNumber={phoneNumber}
              code={code}
              loading={loading}
              countdown={countdown}
              debugCode={debugCode}
              onPhoneNumberChange={setPhoneNumber}
              onCodeChange={setCode}
              onSendCode={handleSendCode}
              onVerify={handleVerifyCode}
              onStepChange={setStep}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
