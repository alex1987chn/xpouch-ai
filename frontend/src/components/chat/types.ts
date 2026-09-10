/**
 * 聊天组件通用类型定义
 */

import type { Message } from '@/types'
import type { AvatarStatus } from '@/components/ui/StatusAvatar'

/**
 * 消息列表 Props
 */
export interface MessageListProps {
  messages: Message[]
  isGenerating: boolean
  activeExpert?: string | null
  onRegenerate?: (messageId: string | number) => void
  onLinkClick?: (href: string) => void
}

/**
 * 消息项 Props
 */
export interface MessageItemProps {
  message: Message
  activeExpert?: string | null
  /** AI 状态 - 用于头像光环动画 */
  aiStatus?: AvatarStatus
  onRegenerate?: (messageId: string | number) => void
  onLinkClick?: (href: string) => void
}

/**
 * 输入控制台 Props
 */
export interface HeavyInputConsoleProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  disabled?: boolean
  /** v3.4.7 图片输入：当前轮随消息发送的图片（dataURL） */
  images?: string[]
  /** 选择新图片（控制台内部完成 File→dataURL 转换，回传完整列表） */
  onImagesSelected?: (images: string[]) => void
  /** 移除指定序号的图片 */
  onRemoveImage?: (index: number) => void
}

/**
 * 输入文本域 Props
 */
export interface HeavyInputTextAreaProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  disabled?: boolean
}

/**
 * 路由指示器 Props
 */
export interface RoutingIndicatorProps {
  expertType: string
}
