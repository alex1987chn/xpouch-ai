/**
 * 聊天组件通用类型定义
 */

import type { Message } from '@/types'

/**
 * 消息列表 Props
 */
export interface MessageListProps {
  messages: Message[]
  isGenerating: boolean
  activeExpert?: string | null
  onRegenerate?: (messageId: string) => void
  onLinkClick?: (href: string) => void
}

/**
 * 消息项 Props
 */
export interface MessageItemProps {
  message: Message
  isLast: boolean
  activeExpert?: string | null
  onRegenerate?: (messageId: string) => void
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
 * 思考区域 Props
 */
export interface ThinkingSectionProps {
  thinking: Array<{
    id: string
    expertType: string
    expertName: string
    content: string
    timestamp: string
    status: 'running' | 'completed' | 'failed'
  }>
}

/**
 * 路由指示器 Props
 */
export interface RoutingIndicatorProps {
  expertType: string
}
