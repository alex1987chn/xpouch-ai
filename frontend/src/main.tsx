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
import { router, AppProviders } from './router'
import './index.css'

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
        <I18nProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
          </ThemeProvider>
        </I18nProvider>
      </AppProvider>
    </AppProviders>
  </StrictMode>,
)
