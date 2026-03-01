/**
 * 路由配置
 * 
 * [架构]
 * 路由层只负责：
 * 1. 路由定义和匹配
 * 2. 懒加载配置
 * 3. 页面组件与 Wrapper 的绑定
 * 
 * 业务逻辑已下沉到：
 * - router/wrappers/* : 页面包装器
 * - router/hooks/* : 业务逻辑 Hooks
 */

import { lazy } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import AppLayout from '@/components/AppLayout'
import AdminRoute from '@/components/AdminRoute'
import { SuspenseWithErrorBoundary } from '@/components/SuspenseWithErrorBoundary'

// 包装器组件
import {
  HistoryPageWrapper,
  LibraryPageWrapper,
  CreateAgentPageWrapper,
  EditAgentPageWrapper,
  UnifiedChatPageWrapper
} from './wrappers'
import { LoadingFallback } from './components/LoadingFallback'

// 同步导入（轻量组件）
import HomePage from '@/pages/home/HomePage'

// 路由懒加载 - 代码分割优化
const ExpertAdminPage = lazy(() => import('@/pages/admin/ExpertAdminPage'))

// 路由配置
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout><Outlet /></AppLayout>,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'library',
        element: <LibraryPageWrapper />
      },
      {
        path: 'history',
        element: <HistoryPageWrapper />
      },
      {
        path: 'create-agent',
        element: <CreateAgentPageWrapper />
      },
      {
        path: 'edit-agent/:id',
        element: <EditAgentPageWrapper />
      },
      {
        path: 'admin/experts',
        element: (
          <AdminRoute>
            <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
              <ExpertAdminPage />
            </SuspenseWithErrorBoundary>
          </AdminRoute>
        )
      },
      {
        path: '*',
        element: <Navigate to="/" replace />
      }
    ]
  },
  {
    // 统一的聊天页面（支持简单和复杂模式）
    path: '/chat',
    element: <AppLayout hideMobileMenu={true}><UnifiedChatPageWrapper /></AppLayout>
  },
  {
    // 统一聊天页面的带ID版本（兼容历史记录跳转）
    path: '/chat/:id',
    element: <AppLayout hideMobileMenu={true}><UnifiedChatPageWrapper /></AppLayout>
  },
  {
    // 登录页面 - 暂时重定向到首页（登录弹窗在首页处理）
    path: '/login',
    element: <Navigate to="/" replace />
  }
])

// 导出 Provider 供 main.tsx 使用
export { AppProviders } from './providers'

// 导出 Hooks 供外部使用
export {
  useRequireAuth,
  useCreateAgent,
  useEditAgent
} from './hooks'

export type {
  AgentFormData,
  AgentEditData
} from './hooks'
