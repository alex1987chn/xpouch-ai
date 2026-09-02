import { Component, ReactNode } from 'react'
import { logger } from '@/utils/logger'

interface Props {
  children: ReactNode
  /** 可选的自定义错误回退组件 */
  fallback?: ReactNode
  /** 错误发生时触发的回调 */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * 🔥 全局错误边界组件
 * 
 * [功能]
 * - 捕获 React 组件树中的错误
 * - 防止整个应用崩溃
 * - 记录错误日志（开发环境输出到控制台，生产环境可上报到监控服务）
 * 
 * [使用]
 * 包裹在应用最外层或关键功能模块外层
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 🔥 记录错误详情
    logger.error('[ErrorBoundary] 捕获到错误:', error, errorInfo)
    
    // 🔥 触发外部回调（如有）
    this.props.onError?.(error, errorInfo)
    
    // 🔥 生产环境错误上报（预留）
    if (import.meta.env.PROD) {
      this.reportError(error, errorInfo)
    }
  }
  
  /**
   * 🔥 错误上报方法（生产环境）
   * 
   * 可以集成以下服务：
   * - Sentry: 专业的错误监控平台
   * - LogRocket: 包含录屏的错误监控
   * - 自建上报服务
   */
  private reportError(_error: Error, _errorInfo: React.ErrorInfo) {
    try {
      // TODO: 集成实际的错误监控服务
      // 示例：Sentry.captureException(error, { extra: errorInfo })
      
      // 临时方案：发送到后端日志（可选）
      // fetch('/api/client-error', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     error: error.message,
      //     stack: error.stack,
      //     componentStack: errorInfo.componentStack,
      //     url: window.location.href,
      //     timestamp: new Date().toISOString(),
      //     userAgent: navigator.userAgent
      //   })
      // })
    } catch (e) {
      // 上报失败不阻断流程
      logger.error('[ErrorBoundary] 错误上报失败:', e)
    }
  }
  
  /**
   * 重置错误状态（用于重试）
   */
  private handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    // 如果有自定义 fallback，使用它
    if (this.state.hasError && this.props.fallback) {
      return this.props.fallback
    }
    
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-page flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 bg-surface-card/60 rounded-2xl border border-border-default shadow-soft">
            {/* 错误图标 */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-status-offline/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-status-offline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h1 className="text-xl font-bold text-content-primary mb-2 text-center">
              出错了
            </h1>
            <p className="text-sm text-content-muted mb-2 text-center">
              应用遇到了意外错误
            </p>
            
            {/* 错误详情（开发环境显示） */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-4 p-3 bg-status-offline/10 rounded-lg overflow-auto max-h-32 bauhaus-scrollbar">
                <p className="text-xs font-mono text-status-offline">
                  {this.state.error.message}
                </p>
              </div>
            )}
            
            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 h-10 rounded-xl border border-border-default text-content-primary hover:bg-surface-elevated transition-all"
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 h-10 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-content-inverted shadow-sm transition-all hover:scale-105"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
