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
 *
 * [v3.4.7 cutover] 对话即桌面：全局唯一壳 WorkbenchLayout，
 * '/' 即工作台；旧 AppLayout（六项导航/双会话列表）与
 * /chat /history /artifacts /create-agent /edit-agent 路由退役。
 */

import { createBrowserRouter, Navigate } from 'react-router-dom'
import AdminRoute from '@/components/AdminRoute'
import { SuspenseWithErrorBoundary } from '@/components/SuspenseWithErrorBoundary'
import { lazyWithReload } from './lazyWithReload'

// 包装器组件
import {
  LibraryPageWrapper,
  WorkbenchPageWrapper
} from './wrappers'
import { LoadingFallback } from './components/LoadingFallback'

// 路由懒加载 - 代码分割优化（chunk 失效自动刷新拿新构建）
const WorkbenchLayout = lazyWithReload(() => import('@/pages/workbench/WorkbenchLayout'))
const StatsPage = lazyWithReload(() => import('@/pages/admin/StatsPage'))
const ManagementConsolePage = lazyWithReload(() => import('@/pages/admin/ManagementConsolePage'))
const RunTimelinePage = lazyWithReload(() => import('@/pages/run/RunTimelinePage'))

// 路由配置
export const router = createBrowserRouter([
  {
    path: '/',
    element: <WorkbenchLayout />,
    children: [
      // '/' 即工作台（新会话）
      { index: true, element: <WorkbenchPageWrapper /> },
      // /workbench 与 /workbench/:id 兼容既有链接与 useChat 导航
      { path: 'workbench', element: <WorkbenchPageWrapper /> },
      { path: 'workbench/:id', element: <WorkbenchPageWrapper /> },
      { path: 'library', element: <LibraryPageWrapper /> },
      {
        // 任务控制：审批注意力层的完整展开（工作台域内）
        path: 'run/:runId',
        element: (
          <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
            <RunTimelinePage />
          </SuspenseWithErrorBoundary>
        )
      },
      {
        path: 'admin/console',
        element: (
          <AdminRoute requiredRole="admin">
            <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
              <ManagementConsolePage />
            </SuspenseWithErrorBoundary>
          </AdminRoute>
        )
      },
      {
        // 专家工作台内嵌管理控制台（?tab=experts），旧路径重定向保书签
        path: 'admin/experts',
        element: <Navigate to="/admin/console?tab=experts" replace />
      },
      {
        // 待拍板：StatsPage 按改版决议将下线/并入控制台，先保功能挂新壳
        path: 'admin/stats',
        element: (
          <AdminRoute requiredRole="user">
            <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
              <StatsPage />
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
    // 登录页面 - 重定向到工作台（登录弹窗在新壳处理）
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
