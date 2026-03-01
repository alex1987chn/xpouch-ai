/**
 * =============================
 * BauhausSidebar 常量定义
 * =============================
 */

export const SIDEBAR_WIDTH = {
  EXPANDED: 280,  // px
  COLLAPSED: 72,  // px
} as const

export const SIDEBAR_CONTENT_WIDTH = 230  // 内容区统一宽度

export const SIDEBAR_SIZES = {
  BUTTON_HEIGHT: 44,       // 导航按钮高度
  BUTTON_HEIGHT_LARGE: 60, // 新建按钮高度
  AVATAR_SIZE: 36,         // 头像大小
  ICON_SIZE: 16,           // 图标大小
  ICON_SIZE_LARGE: 20,     // 大图标大小
  TOGGLE_BAR_WIDTH: 20,    // 收拢把手宽度
  TOGGLE_BAR_HEIGHT: 20,   // 展开把手高度
} as const

// Tailwind 类名字符串（用于模板）
export const TW = {
  CONTENT_WIDTH: 'w-[230px]',
  BUTTON_WIDTH: 'w-[230px]',
  BUTTON_HEIGHT: 'h-[44px]',
  BUTTON_HEIGHT_LARGE: 'h-[60px]',
  ICON_SIZE: 'w-4 h-4',
  ICON_SIZE_LARGE: 'w-5 h-5',
} as const
