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
export const devLog = logger.debug.bind(logger)

/**
 * 统一错误处理器
 *
 * @description
 * 提供错误处理、规范化、日志记录的工具对象
 * 支持异步和同步错误处理，自动发送到日志系统
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   await errorHandler.handle(error, 'riskyOperation')
 * }
 * ```
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
 * 安全获取数组元素
 *
 * @description
 * 安全地从数组中获取指定索引的元素
 * 如果数组为 null/undefined 或索引越界，返回兜底值
 *
 * @template T - 数组元素类型
 * @param array - 目标数组（可为 null/undefined）
 * @param index - 要获取的索引
 * @param fallback - 兜底值（默认）
 * @returns T - 数组元素或兜底值
 *
 * @example
 * ```typescript
 * const arr = ['a', 'b', 'c']
 * const item = safeGet(arr, 1, 'default') // 'b'
 * const missing = safeGet(arr, 5, 'default') // 'default'
 * const nullArr = safeGet(null, 0, 'default') // 'default'
 * ```
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
 *
 * @description
 * 安全地从对象中获取指定属性的值
 * 如果对象为 null/undefined 或属性不存在，返回兜底值
 *
 * @template T - 对象类型
 * @template K - 属性键类型
 * @param obj - 目标对象（可为 null/undefined）
 * @param key - 要获取的属性键
 * @param fallback - 兜底值
 * @returns T[K] - 属性值或兜底值
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: 2 }
 * const value = safeGetProp(obj, 'a', 0) // 1
 * const missing = safeGetProp(obj, 'c', 0) // 0
 * const nullObj = safeGetProp(null, 'a', 0) // 0
 * ```
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
 *
 * @description
 * 安全地执行可选的回调函数
 * 如果回调不存在或执行出错，返回 undefined 并记录错误
 *
 * @template T - 返回值类型
 * @param fn - 要执行的回调函数（可选）
 * @param args - 传递给回调函数的参数
 * @returns T | undefined - 回调返回值或 undefined
 *
 * @example
 * ```typescript
 * const onClick = (e: Event) => console.log(e)
 * const result = safeCall(onClick, event) // 执行函数
 * const noFn = safeCall(null) // undefined
 * const throwing = safeCall(() => { throw new Error('') }) // undefined (error logged)
 * ```
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
 *
 * @description
 * 将任意值安全地转换为数字
 * 如果值为 null/undefined 或转换结果为 NaN，返回 0 或自定义兜底值
 *
 * @param value - 要转换的值
 * @param fallback - 兜底值（默认 0）
 * @returns number - 数字或兜底值
 *
 * @example
 * ```typescript
 * const num1 = safeNumber(42) // 42
 * const num2 = safeNumber(null) // 0
 * const num3 = safeNumber('42') // 42
 * const num4 = safeNumber('abc', 10) // 10
 * const num5 = safeNumber(NaN, 100) // 100
 * ```
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
 *
 * @description
 * 将任意值安全地转换为布尔值
 * 如果值为 null/undefined，返回 false 或自定义兜底值
 *
 * @param value - 要转换的值
 * @param fallback - 兜底值（默认 false）
 * @returns boolean - 布尔值或兜底值
 *
 * @example
 * ```typescript
 * const bool1 = safeBoolean(true) // true
 * const bool2 = safeBoolean(null) // false
 * const bool3 = safeBoolean(1) // true
 * const bool4 = safeBoolean(0) // false
 * const bool5 = safeBoolean(null, true) // true
 * ```
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



