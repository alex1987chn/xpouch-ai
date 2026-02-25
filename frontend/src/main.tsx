/**
 * 应用入口文件
 * 职责：初始化React根实例，配置全局Providers
 * 路由配置已抽离到 router.tsx
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './hooks/useTheme'
import { AppProvider } from './providers/AppProvider'
import { AuthInitializer } from './components/AuthInitializer'
import { router, AppProviders } from './router'
import './index.css'

// 🔥 全局错误处理：捕获动态导入失败并自动刷新
window.addEventListener('error', (event) => {
  const errorMessage = event.error?.message || event.message || ''
  
  // 检查是否是动态导入失败
  if (errorMessage.includes('Failed to fetch dynamically imported module') ||
      errorMessage.includes('Importing a module script failed')) {
    console.error('[Global Error] 动态导入失败，准备刷新页面:', errorMessage)
    
    // 清除缓存并刷新（使用 hard reload）
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name))
      }).finally(() => {
        window.location.reload()
      })
    } else {
      window.location.reload()
    }
  }
})

// 捕获未处理的 Promise 错误（如动态导入）
window.addEventListener('unhandledrejection', (event) => {
  const errorMessage = event.reason?.message || String(event.reason) || ''
  
  if (errorMessage.includes('Failed to fetch dynamically imported module') ||
      errorMessage.includes('Importing a module script failed')) {
    console.error('[Unhandled Promise] 动态导入失败，准备刷新页面:', errorMessage)
    event.preventDefault()
    
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name))
      }).finally(() => {
        window.location.reload()
      })
    } else {
      window.location.reload()
    }
  }
})

// 防止 HMR 时重复调用 createRoot
const container = document.getElementById('root')!

// 定义 HMR 根缓存类型
interface HMRRootContainer extends HTMLElement {
  _reactRoot?: any
}

// 使用类型断言（HMR 特殊场景）
const hmrContainer = container as HMRRootContainer
const root = hmrContainer._reactRoot || createRoot(container)
hmrContainer._reactRoot = root

root.render(
  <StrictMode>
    <AppProviders>
      <AppProvider>
        <AuthInitializer>
          <I18nProvider>
            <ThemeProvider>
              <RouterProvider router={router} />
            </ThemeProvider>
          </I18nProvider>
        </AuthInitializer>
      </AppProvider>
    </AppProviders>
  </StrictMode>,
)
