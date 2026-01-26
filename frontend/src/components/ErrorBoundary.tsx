import { Component, ReactNode } from 'react'
import { logger } from '@/utils/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cashmere-page dark:bg-ai-bg-light flex items-center justify-center">
          <div className="max-w-md p-6 bg-white/60 dark:bg-ai-card-light rounded-2xl border border-cashmere-border dark:border-ai-card-light shadow-[0_10px_30px_rgba(74,55,40,0.05)]">
            <h1 className="text-2xl font-bold text-cashmere-text dark:text-ai-text-light mb-4">
              Oops! Something went wrong
            </h1>
            <p className="text-sm text-cashmere-muted dark:text-ai-text-light/80 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full h-10 rounded-xl bg-gradient-to-r from-cashmere-primary to-cashmere-hover hover:from-cashmere-hover hover:to-cashmere-primary text-cashmere-text shadow-sm transition-all hover:scale-105 dark:bg-gradient-to-r dark:from-ai-primary-light dark:to-ai-primary-dark dark:text-ai-text-light"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
