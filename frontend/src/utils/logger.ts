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
 * 应用级错误类型
 *
 * @description
 * 继承自标准 Error 类，用于创建结构化的应用错误
 * 包含错误码和原始错误信息，便于错误追踪和调试
 *
 * @example
 * ```typescript
 * const error = new AppError('Failed to fetch user', 'FETCH_ERROR', originalError)
 * errorHandler.handle(error, 'fetchUser')
 * ```
 */
export class AppError extends Error {
  /**
   * 构造应用错误
   *
   * @param message - 错误消息
   * @param code - 错误码（可选）
   * @param originalError - 原始错误对象（可选）
   */
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

export const errorHandler = {
  /**
   * 处理异步错误
   *
   * @param error - 错误对象（任意类型）
   * @param context - 错误上下文（可选），用于标识错误发生位置
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * await errorHandler.handle(new Error('API Error'), 'fetchData')
   * ```
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
   *
   * @param error - 错误对象（任意类型）
   * @param context - 错误上下文（可选）
   *
   * @example
   * ```typescript
   * try {
   *   syncOperation()
   * } catch (error) {
   *   errorHandler.handleSync(error, 'syncOperation')
   * }
   * ```
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
   *
   * @description
   * 将任意类型的错误转换为标准的 AppError 对象
   * 支持 Error、string、AppError 和其他类型
   *
   * @param error - 错误对象（任意类型）
   * @param context - 错误上下文（可选）
   * @returns AppError - 规范化后的错误对象
   *
   * @example
   * ```typescript
   * const normalized = errorHandler.normalizeError(error, 'operation')
   * console.log(normalized.code) // 'UNKNOWN_ERROR'
   * ```
   */
  normalizeError(error: unknown, _context?: string): AppError {
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
   *
   * @description
   * 从任意错误类型中提取用户友好的错误消息
   * 支持中文默认消息
   *
   * @param error - 错误对象（任意类型）
   * @returns string - 用户友好的错误消息
   *
   * @example
   * ```typescript
   * const message = errorHandler.getUserMessage(error)
   * alert(message) // 显示给用户
   * ```
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
 * 安全访问工具函数
 *
 * @description
 * 提供一组安全的访问工具，用于处理可能的 undefined/null 值
 * 所有工具都支持兜底值（fallback），防止运行时错误
 *
 * @example
 * ```typescript
 * const name = safeString(user?.name, 'Anonymous')
 * const count = safeNumber(data?.count, 0)
 * const callback = safeCall(onClick, event)
 * ```
 */







/**
 * 安全字符串处理
 *
 * @description
 * 将任意值安全地转换为字符串
 * 如果值为 null/undefined，返回空字符串或自定义兜底值
 *
 * @param value - 要转换的值
 * @param fallback - 兜底值（默认空字符串）
 * @returns string - 字符串或兜底值
 *
 * @example
 * ```typescript
 * const str1 = safeString('hello') // 'hello'
 * const str2 = safeString(null) // ''
 * const str3 = safeString(undefined, 'default') // 'default'
 * const str4 = safeString(123) // '123'
 * ```
 */

