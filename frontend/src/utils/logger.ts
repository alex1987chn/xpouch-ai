// 统一日志和错误处理工具
// 根据环境变量控制日志输出

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
} as const

// 当前日志级别（默认生产环境）
const currentLevel = import.meta.env.VITE_LOG_LEVEL
  ? LOG_LEVELS[import.meta.env.VITE_LOG_LEVEL as keyof typeof LOG_LEVELS]
  : LOG_LEVELS.ERROR

/**
 * 错误类型
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/**
 * 日志函数
 */
export const logger = {
  /**
   * 错误日志 - 所有环境都输出
   */
  error: (...args: unknown[]) => {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error('[XPouch ERROR]', ...args)
    }
  },

  /**
   * 警告日志 - WARN及以上级别输出
   */
  warn: (...args: unknown[]) => {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn('[XPouch WARN]', ...args)
    }
  },

  /**
   * 信息日志 - INFO及以上级别输出
   */
  info: (...args: unknown[]) => {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log('[XPouch INFO]', ...args)
    }
  },

  /**
   * 调试日志 - 仅DEBUG级别输出
   */
  debug: (...args: unknown[]) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log('[XPouch DEBUG]', ...args)
    }
  }
}

/**
 * 开发环境快捷方式（仅开发环境使用）
 */
export const devLog = logger.debug.bind(logger)

/**
 * 统一错误处理器
 */
export const errorHandler = {
  /**
   * 处理异步错误
   */
  async handle(error: unknown, context?: string): Promise<void> {
    const appError = this.normalizeError(error, context)

    // 记录错误
    logger.error(appError.message, {
      code: appError.code,
      context,
      stack: appError.stack
    })

    // TODO: 发送到错误监控服务（如 Sentry）
    // await this.sendToMonitoring(appError)

    // TODO: 显示用户友好的错误提示（如 Toast）
    // showErrorToast(appError.userMessage)
  },

  /**
   * 处理同步错误
   */
  handleSync(error: unknown, context?: string): void {
    const appError = this.normalizeError(error, context)

    // 记录错误
    logger.error(appError.message, {
      code: appError.code,
      context,
      stack: appError.stack
    })

    // TODO: 显示用户友好的错误提示
    // showErrorToast(appError.userMessage)
  },

  /**
   * 规范化错误对象
   */
  normalizeError(error: unknown, context?: string): AppError {
    // 已经是 AppError
    if (error instanceof AppError) {
      return error
    }

    // 标准 Error
    if (error instanceof Error) {
      return new AppError(error.message, undefined, error)
    }

    // 字符串
    if (typeof error === 'string') {
      return new AppError(error, undefined, error)
    }

    // 其他类型
    return new AppError('Unknown error occurred', 'UNKNOWN_ERROR', error)
  },

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(error: unknown): string {
    if (error instanceof AppError) {
      return error.message
    }

    if (error instanceof Error) {
      return error.message
    }

    if (typeof error === 'string') {
      return error
    }

    return '发生了未知错误，请稍后重试'
  }
}

/**
 * 装饰器：自动捕获函数错误
 */
export function withErrorHandler<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context?: string
): T {
  return ((...args: unknown[]) => {
    try {
      const result = fn(...args)

      // 处理异步函数
      if (result instanceof Promise) {
        return result.catch((error) => {
          errorHandler.handle(error, context)
          throw error // 重新抛出，让调用者处理
        })
      }

      return result
    } catch (error) {
      errorHandler.handleSync(error, context)
      throw error // 重新抛出，让调用者处理
    }
  }) as T
}

/**
 * 快捷函数：创建错误处理器的装饰器版本
 */
export function safeExecute<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context?: string
): T {
  return withErrorHandler(fn, context)
}

/**
 * 安全访问工具函数
 * 用于处理可能的 undefined/null 值
 */

/**
 * 安全获取数组元素
 */
export function safeGet<T>(
  array: T[] | null | undefined,
  index: number,
  fallback: T
): T {
  if (!array || !array[index]) {
    return fallback
  }
  return array[index]
}

/**
 * 安全获取对象属性
 */
export function safeGetProp<T, K extends keyof T>(
  obj: T | null | undefined,
  key: K,
  fallback: T[K]
): T[K] {
  if (!obj || obj[key] === undefined) {
    return fallback
  }
  return obj[key]
}

/**
 * 安全执行可选回调
 */
export function safeCall<T>(
  fn?: (...args: unknown[]) => T,
  ...args: unknown[]
): T | undefined {
  if (typeof fn !== 'function') {
    return undefined
  }
  try {
    return fn(...args)
  } catch (error) {
    errorHandler.handleSync(error, 'safeCall')
    return undefined
  }
}

/**
 * 安全字符串处理
 */
export function safeString(value: unknown, fallback: string = ''): string {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'string') {
    return value
  }
  return String(value)
}

/**
 * 安全数字处理
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'number') {
    return value
  }
  const num = Number(value)
  return isNaN(num) ? fallback : num
}

/**
 * 安全布尔值处理
 */
export function safeBoolean(value: unknown, fallback: boolean = false): boolean {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'boolean') {
    return value
  }
  return Boolean(value)
}


