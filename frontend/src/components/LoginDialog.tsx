import { useState, useEffect } from 'react'
import { Dialog, DialogContentCentered, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleReset()
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContentCentered className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
            欢迎使用 XPouch AI
          </DialogTitle>
          <DialogDescription className="text-base">
            请使用手机验证码登录
          </DialogDescription>
        </DialogHeader>

        {/* 调试信息 */}
        {import.meta.env.DEV && (
          <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
            <div>🔍 调试信息:</div>
            <div>当前步骤: {step}</div>
            <div>DEV: {String(import.meta.env.DEV)}</div>
            <div>MODE: {import.meta.env.MODE}</div>
            <div>验证码: {debugCode || '(未收到)'}</div>
            <div>倒计时: {countdown}</div>
          </div>
        )}

        <div className="space-y-6 py-4">
          {/* 步骤1: 输入手机号 */}
          {step === 'phone' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">
                  手机号码
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="请输入11位手机号码"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  maxLength={11}
                  disabled={loading}
                  className="text-lg"
                  autoFocus
                />
              </div>

              <Button
                onClick={handleSendCode}
                disabled={!phoneNumber || phoneNumber.length !== 11 || loading}
                className="w-full h-11 text-base font-medium"
              >
                {loading ? '发送中...' : '发送验证码'}
              </Button>

              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                首次登录将自动注册账号
              </div>
            </div>
          )}

          {/* 步骤2: 输入验证码 */}
          {step === 'code' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-medium">
                  验证码
                </Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  placeholder="请输入6位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  disabled={loading}
                  className="text-lg text-center tracking-[0.5em]"
                  autoFocus
                />
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>验证码已发送至 {phoneNumber.slice(0, 3)}****{phoneNumber.slice(-4)}</span>
                </div>
              </div>

              <Button
                onClick={handleVerifyCode}
                disabled={!code || code.length < 4 || loading}
                className="w-full h-11 text-base font-medium"
              >
                {loading ? '验证中...' : '登录'}
              </Button>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading}
                  className="w-full h-10 text-sm"
                >
                  {countdown > 0 ? `${countdown}秒后重新发送` : '重新发送验证码'}
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setStep('phone')}
                  disabled={loading}
                  className="w-full h-10 text-sm text-gray-600 dark:text-gray-400"
                >
                  返回修改手机号
                </Button>
              </div>

              {/* 开发环境显示验证码 */}
              {import.meta.env.DEV && countdown > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <div className="text-xs text-yellow-800 dark:text-yellow-200">
                    <div className="font-medium mb-1">🔧 开发环境提示</div>
                    <div>验证码: <span className="font-mono font-bold text-lg">{debugCode}</span></div>
                    <div className="mt-1 text-yellow-600 dark:text-yellow-400">（请在上方验证码输入框输入）</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContentCentered>
    </Dialog>
  )
}
