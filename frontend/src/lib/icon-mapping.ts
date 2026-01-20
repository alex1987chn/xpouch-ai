/**
 * 图标映射工具
 * 动态导入 Lucide 图标，避免在 .ts 常量文件中使用 JSX
 */

import * as LucideIcons from 'lucide-react'

export type IconName =
  | 'Search'
  | 'Code'
  | 'FileText'
  | 'PenTool'
  | 'Layout'
  | 'MessageSquare'
  | 'Image'

/**
 * 根据名称获取 Lucide 图标组件
 */
export function LucideIconName(name: IconName) {
  switch (name) {
    case 'Search':
      return LucideIcons.Search
    case 'Code':
      return LucideIcons.Code
    case 'FileText':
      return LucideIcons.FileText
    case 'PenTool':
      return LucideIcons.PenTool
    case 'Layout':
      return LucideIcons.Layout
    case 'MessageSquare':
      return LucideIcons.MessageSquare
    case 'Image':
      return LucideIcons.Image
    default:
      return LucideIcons.Bot
  }
}
