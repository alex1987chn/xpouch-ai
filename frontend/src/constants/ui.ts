// UI 相关常量
// 集中管理所有 UI 配置和魔法数字

// 系统版本号
export const VERSION = {
  /** 当前 OS 版本号 */
  CURRENT: 'v3.2.0',
  /** 主版本号 */
  MAJOR: 3,
  /** 次版本号 */
  MINOR: 2,
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

// 动画时长（统一使用秒或毫秒，与 CSS transition 一致）
export const ANIMATION_DURATION = {
  /** 快速动画 - 按钮点击、微交互 (0.15s = 150ms) */
  FAST: 0.15,
  /** 标准动画 - 面板切换、折叠 (0.2s = 200ms) */
  NORMAL: 0.2,
  /** 慢速动画 - 模态框、全屏切换 (0.3s = 300ms) */
  SLOW: 0.3,
} as const

// 布局尺寸
export const DIMENSIONS = {
  /** 侧边栏展开宽度 (px) */
  SIDEBAR_WIDTH: 280,
  /** 侧边栏折叠宽度 (px) */
  SIDEBAR_COLLAPSED_WIDTH: 72,
  /** 侧边栏内容区宽度 (px) - 导航按钮等 */
  SIDEBAR_CONTENT_WIDTH: 230,
  /** 导航按钮高度 (px) */
  NAV_ITEM_HEIGHT: 44,
  /** 新建聊天按钮高度 (px) */
  NEW_CHAT_BUTTON_HEIGHT: 60,
  /** ExpertRail 宽度 (px) */
  RAIL_WIDTH: 56,
  /** 顶部 Header 高度 (px) */
  HEADER_HEIGHT: 64,
  /** 底部输入框最小高度 (px) */
  INPUT_MIN_HEIGHT: 80,
} as const

// 防抖配置
export const DEBOUNCE = {
  /** 搜索输入防抖 (ms) */
  SEARCH: 300,
  /** 窗口调整防抖 (ms) */
  RESIZE: 100,
  /** 滚动事件防抖 (ms) */
  SCROLL: 50,
} as const
