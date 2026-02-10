// UI 相关常量
// 集中管理所有 UI 配置和魔法数字

// 系统版本号
export const VERSION = {
  /** 当前 OS 版本号 */
  CURRENT: 'v3.1.0',
  /** 主版本号 */
  MAJOR: 3,
  /** 次版本号 */
  MINOR: 1,
  /** 修订号 */
  PATCH: 0,
  /** 完整版本字符串 */
  get FULL() { return `XPOUCH OS ${this.CURRENT}` }
}

// 手势滑动相关
export const SWIPE = {
  /** 触发返回手势的最小滑动距离 */
  THRESHOLD: 100,
  /** 触发返回的边缘区域宽度 */
  EDGE_ZONE: 30,
  /** 最大滑动距离 */
  MAX_DISTANCE: 150
}

// 输入框相关
export const INPUT = {
  /** 默认文本框行数 */
  DEFAULT_ROWS: 3,
  /** 最大文本框行数 */
  MAX_ROWS: 10
}

// 进度条相关
export const PROGRESS = {
  /** 像素进度条的数量 */
  PIXEL_COUNT: 16
}

// 动画时长
export const ANIMATION = {
  /** 魔法效果持续时间 */
  MAGIC_EFFECT_DURATION: 3000,
  /** 默认过渡时长 */
  DEFAULT_TRANSITION: 200
}

// 布局相关
export const LAYOUT = {
  /** 默认缩放比例 */
  DEFAULT_SCALE: 1,
  /** 最小缩放比例 */
  MIN_SCALE: 0.5,
  /** 最大缩放比例 */
  MAX_SCALE: 2,
  /** 缩放步长 */
  SCALE_STEP: 0.1
}

// API 相关
export const API = {
  /** 默认超时时间 */
  DEFAULT_TIMEOUT: 30000,
  /** 消息标题最大长度 */
  TITLE_MAX_LENGTH: 30
}
