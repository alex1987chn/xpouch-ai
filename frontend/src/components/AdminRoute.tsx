import { Navigate, useLocation } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'

interface AdminRouteProps {
  children: React.ReactNode
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAuthenticated } = useUserStore()
  const location = useLocation()

  // 检查是否已登录且是管理员
  if (!isAuthenticated || !user || user.role !== 'admin') {
    // 重定向到首页，并记录原始路径（可选）
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}
