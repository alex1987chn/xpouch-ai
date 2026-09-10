import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useAppUIStore } from '@/store/appUIStore'
import { useToast } from '@/components/ui/use-toast'
import { useTranslation } from '@/i18n'
import { PermissionLockCard } from '@/components/ui/lock-card'
import { LoadingFallback } from '@/router/components/LoadingFallback'

interface AdminRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'user'  // 所需角色（v3.4.7 双角色收敛）
}

export default function AdminRoute({ children, requiredRole = 'admin' }: AdminRouteProps) {
  const { user, isAuthenticated, isAuthChecked } = useUserStore()
  const openLogin = useAppUIStore((s) => s.openLogin)
  const { toast } = useToast()
  const { t } = useTranslation()

  // 未登录：就地渲染登录锁卡片，并自动打开全局登录弹窗——
  // 登录成功后本页直接呈现，无需回跳。
  // 不跳 /login：那里只是回首页的占位，会造成「点了没反应」的假象。
  useEffect(() => {
    if (isAuthChecked && !isAuthenticated) {
      openLogin()
    }
  }, [isAuthChecked, isAuthenticated, openLogin])

  // 角色判定（必须在全部 hooks 之后、任何提前 return 之前完成计算）
  const allowed = (() => {
    if (!user) return false
    switch (requiredRole) {
      case 'admin':
        return user.role === 'admin'
      case 'user':
        return true
      default:
        return false
    }
  })()

  // 权限不足：一次性提示 + 回首页。
  // ⚠️ toast 不能在 render 期调用（store 更新会触发无限重渲染 → React #301）
  useEffect(() => {
    if (isAuthChecked && isAuthenticated && user && !allowed) {
      toast({
        title: t('permissionDenied'),
        description: t('adminOnly'),
        variant: 'destructive'
      })
    }
  }, [isAuthChecked, isAuthenticated, user, allowed, toast, t])

  // P0-6 修复: 等待认证检查完成
  if (!isAuthChecked) {
    return <LoadingFallback />
  }

  // 检查是否已登录
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[100dvh] bg-surface-page flex items-center justify-center p-4">
        <div className="w-full max-w-xl">
          <PermissionLockCard title={t('login')} description={t('loginRequiredDesc')} />
        </div>
      </div>
    )
  }

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
