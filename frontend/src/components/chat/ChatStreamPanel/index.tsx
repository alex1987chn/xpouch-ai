/**
 * =============================
 * 聊天流面板 (ChatStreamPanel)
 * =============================
 *
 * [架构层级] Layer 5 - 聊天界面组件
 *
 * [设计风格] Industrial Terminal (工业终端)
 * - 点阵背景：dot-grid
 * - 终端风格：等宽字体、行号、命令提示符
 * - 机械控制台：重型边框、阴影、物理开关
 *
 * [核心功能]
 * 1. 消息流渲染：用户消息 + AI 消息 + 路由指示器
 * 2. Markdown 支持：GFM 表格、代码高亮 (rehype-highlight)
 * 3. 输入控制台：Heavy Input Console（机械风格）
 * 4. 工具按钮：附件、网络搜索
 *
 * [组件拆分]
 * - EmptyState: 空状态展示
 * - MessageItem: 单条消息渲染
 * - GeneratingIndicator: 生成中动画
 * - HeavyInputConsole: 输入控制台
 *
 * [状态管理]
 * - 所有状态通过 Props 传入，保持组件纯函数
 * - 状态管理由父组件和 Zustand Store 负责
 */

import { useRef, useEffect } from 'react'
import type { Message } from '@/types'
import EmptyState from '../EmptyState'
import MessageItem from '../MessageItem'
import GeneratingIndicator from '../GeneratingIndicator'
import HeavyInputConsole from '../HeavyInputConsole'

interface ChatStreamPanelProps {
  /** 消息列表 */
  messages: Message[]
  /** 是否正在生成回复 */
  isGenerating: boolean
  /** 当前输入值 */
  inputValue: string
  /** 输入框变化回调 */
  onInputChange: (value: string) => void
  /** 发送消息回调 */
  onSend: () => void
  /** 停止生成回调 */
  onStop?: () => void
  /** 当前活跃专家 (用于显示路由指示器) */
  activeExpert?: string | null
  /** 重新生成消息回调 */
  onRegenerate?: (messageId: string) => void
  /** 链接点击回调 */
  onLinkClick?: (href: string) => void
}

/**
 * 左侧聊天流面板 - Industrial Style
 *
 * 包含：
 * 1. 消息列表 (Terminal 风格)
 * 2. 底部输入控制台 (Heavy Input Console)
 */
export default function ChatStreamPanel({
  messages,
  isGenerating,
  inputValue,
  onInputChange,
  onSend,
  onStop,
  activeExpert,
  onRegenerate,
  onLinkClick,
}: ChatStreamPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isGenerating])

  // 处理发送
  const handleSend = () => {
    if (!inputValue.trim() || isGenerating) return
    onSend()
  }

  return (
    <>
      {/* 消息列表区域 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 dot-grid scrollbar-hide"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg, index) => (
            <MessageItem
              key={msg.id || index}
              message={msg}
              isLast={index === messages.length - 1}
              activeExpert={activeExpert}
              onRegenerate={onRegenerate}
              onLinkClick={onLinkClick}
            />
          ))
        )}

        {/* 生成中指示器 */}
        {isGenerating && <GeneratingIndicator />}
      </div>

      {/* 底部输入控制台 */}
      <HeavyInputConsole
        value={inputValue}
        onChange={onInputChange}
        onSend={handleSend}
        onStop={onStop}
        disabled={isGenerating}
      />
    </>
  )
}

// 导出类型供外部使用
export type { ChatStreamPanelProps }
