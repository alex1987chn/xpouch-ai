import * as Sentry from '@sentry/react'
import { useEffect } from 'react'

// Initialize Sentry
if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN || '',
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,

    // Performance Monitoring
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

// Custom hook to track component renders
export function useSentryTrack(componentName: string) {
  useEffect(() => {
    // Add a breadcrumb for component mount
    Sentry.addBreadcrumb({
      category: 'component',
      message: `${componentName} mounted`,
      level: 'info',
    })

    return () => {
      // Add a breadcrumb for component unmount
      Sentry.addBreadcrumb({
        category: 'component',
        message: `${componentName} unmounted`,
        level: 'info',
      })
    }
  }, [componentName])
}

// Custom error reporting
export function reportError(error: Error, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value)
      })
    }

    Sentry.captureException(error)
  })
}

// Custom message reporting
export function reportMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level)
}

export { Sentry }
