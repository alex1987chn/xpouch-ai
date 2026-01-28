import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { The4DPocketLogo } from '@/components/bauhaus'
import { useUserStore } from '@/store/userStore'
import { logger } from '@/utils/logger'

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export default function LoginDialog({ open, onOpenChange, onSuccess }: LoginDialogProps) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [debugCode, setDebugCode] = useState('')

  const { sendVerificationCode, loginWithPhone } = useUserStore()

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
      alert('请输入有效的手机号码')
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
      alert((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // 验证验证码并登录
  const handleVerifyCode = async () => {
    if (!code || code.length < 4) {
      alert('请输入验证码')
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
      alert((error as Error).message)
    } finally {
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

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="relative bg-[var(--bg-card)] border-2 border-[var(--border-color)] shadow-[var(--shadow-color)_8px_8px_0_0] w-[380px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - Bauhaus风格 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              /// AUTHENTICATION
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <span className="text-xs font-bold">×</span>
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="p-6 space-y-5">
          {/* Logo和标题 */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-2 border-[var(--border-color)] bg-[var(--bg-page)] flex items-center justify-center">
              <The4DPocketLogo />
            </div>
            <h2 className="text-lg font-black uppercase tracking-tight mb-1 text-[var(--text-primary)]">
              {step === 'phone' ? '欢迎回来' : '验证身份'}
            </h2>
            <p className="text-xs font-mono text-[var(--text-secondary)]">
              {step === 'phone' ? 'WELCOME BACK' : 'VERIFY IDENTITY'}
            </p>
          </div>

          {/* 调试信息 */}
          {import.meta.env.DEV && (
            <div className="p-2 bg-[var(--bg-page)] border border-[var(--border-color)] font-mono text-[10px] text-[var(--text-secondary)]">
              <div>🔍 DEBUG_MODE</div>
              <div>STEP: {step}</div>
              <div>CODE: {debugCode || 'NONE'}</div>
              <div>TIMER: {countdown}s</div>
            </div>
          )}

          {/* 步骤1: 输入手机号 */}
          {step === 'phone' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                  PHONE_NUMBER
                </label>
                <input
                  type="tel"
                  placeholder="11位手机号码"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  maxLength={11}
                  disabled={loading}
                  autoFocus
                  className="w-full px-3 py-2.5 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
                />
              </div>

              <button
                onClick={handleSendCode}
                disabled={!phoneNumber || phoneNumber.length !== 11 || loading}
                className="w-full py-3 border-2 border-[var(--border-color)] bg-[var(--accent-hover)] text-black font-bold font-mono text-sm uppercase shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[var(--shadow-color)_6px_6px_0_0] active:translate-x-[0px] active:translate-y-[0px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'SENDING...' : '发送验证码'}
              </button>

              <div className="text-center font-mono text-[10px] text-[var(--text-secondary)] opacity-60">
                首次登录将自动注册账号
              </div>
            </div>
          )}

          {/* 步骤2: 输入验证码 */}
          {step === 'code' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                  VERIFICATION_CODE
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  disabled={loading}
                  autoFocus
                  className="w-full px-3 py-2.5 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-lg text-center tracking-[0.3em] focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
                />
                <div className="font-mono text-[9px] text-[var(--text-secondary)] opacity-50">
                  验证码已发送至 {phoneNumber.slice(0, 3)}****{phoneNumber.slice(-4)}
                </div>
              </div>

              <button
                onClick={handleVerifyCode}
                disabled={!code || code.length < 4 || loading}
                className="w-full py-3 border-2 border-[var(--border-color)] bg-[var(--accent-hover)] text-black font-bold font-mono text-sm uppercase shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[var(--shadow-color)_6px_6px_0_0] active:translate-x-[0px] active:translate-y-[0px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'VERIFYING...' : '登录 / LOGIN'}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading}
                  className="flex-1 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] font-mono text-xs uppercase hover:bg-[var(--bg-page)] transition-colors disabled:opacity-50"
                >
                  {countdown > 0 ? `${countdown}s` : '重新发送'}
                </button>

                <button
                  onClick={() => setStep('phone')}
                  disabled={loading}
                  className="flex-1 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] font-mono text-xs uppercase text-[var(--text-secondary)] hover:bg-[var(--bg-page)] transition-colors"
                >
                  修改手机号
                </button>
              </div>

              {/* 开发环境显示验证码 */}
              {import.meta.env.DEV && countdown > 0 && (
                <div className="p-3 bg-[var(--accent-hover)]/10 border-2 border-[var(--accent-hover)]">
                  <div className="font-mono text-[10px] text-[var(--text-primary)]">
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
