/**
 * =============================
 * BauhausSidebar 常量定义
 * =============================
 * 
 * 注意：实际尺寸由 CSS 变量控制，这里的值用于 JS 计算
 * --sidebar-width-expanded: 280px
 * --sidebar-width-collapsed: 72px
 * --sidebar-content-width: 230px
 * --sidebar-button-height: 44px
 * --sidebar-button-height-large: 60px
 */

export const SIDEBAR_WIDTH = {
  EXPANDED: 280,  // px - 对应 var(--sidebar-width-expanded)
  COLLAPSED: 72,  // px - 对应 var(--sidebar-width-collapsed)
} as const

export const SIDEBAR_CONTENT_WIDTH = 230  // 对应 var(--sidebar-content-width)

export const SIDEBAR_SIZES = {
  BUTTON_HEIGHT: 44,       // 对应 var(--sidebar-button-height)
  BUTTON_HEIGHT_LARGE: 60, // 对应 var(--sidebar-button-height-large)
  AVATAR_SIZE: 36,
  ICON_SIZE: 16,
  ICON_SIZE_LARGE: 20,
  TOGGLE_BAR_WIDTH: 20,
  TOGGLE_BAR_HEIGHT: 20,
} as const

// Tailwind 类名字符串（使用 CSS 变量实现主题自适应）
export const TW = {
  CONTENT_WIDTH: 'w-[var(--sidebar-content-width)]',
  BUTTON_WIDTH: 'w-[var(--sidebar-content-width)]',
  BUTTON_HEIGHT: 'h-[var(--sidebar-button-height)]',
  BUTTON_HEIGHT_LARGE: 'h-[var(--sidebar-button-height-large)]',
  ICON_SIZE: 'w-4 h-4',
  ICON_SIZE_LARGE: 'w-5 h-5',
} as const
