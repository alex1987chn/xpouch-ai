import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { useUserStore } from '@/store/userStore'

// 聊天页面的专用布局，不包含侧边栏
export default function ChatLayout() {
  const { fetchUser } = useUserStore()

  // 确保用户信息已加载
  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  return <Outlet />
}

