import { Navigate, useLocation } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useToast } from '@/components/ui/use-toast'

interface AdminRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'edit_admin' | 'view_admin'  // 所需角色
}

export default function AdminRoute({ children, requiredRole = 'admin' }: AdminRouteProps) {
  const { user, isAuthenticated } = useUserStore()
  const location = useLocation()
  const { toast } = useToast()

  // 检查是否已登录
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 检查用户角色
  const hasPermission = () => {
    switch (requiredRole) {
      case 'admin':
        return user.role === 'admin'
      case 'edit_admin':
        return user.role === 'admin' || user.role === 'edit_admin'
      case 'view_admin':
        return user.role === 'admin' || user.role === 'edit_admin' || user.role === 'view_admin'
      default:
        return false
    }
  }

  // 权限不足，显示提示并重定向到首页
  if (!hasPermission()) {
    toast({
      title: '权限不足',
      description: '该功能仅限管理员使用',
      variant: 'destructive'
    })
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}
