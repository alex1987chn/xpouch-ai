// 统一日志工具
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
