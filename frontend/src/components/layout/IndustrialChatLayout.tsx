import { ReactNode } from 'react'
import { cn } from '@/lib/utils'


/**
 * =============================
 * 工业风格双栏布局 (IndustrialChatLayout)
 * =============================
 *
 * [架构层级] Layer 4 - 布局容器组件
 *
 * [设计风格] Heavy Industry (XPouch v2.7)
 * - 硬边工业风格：黑色边框、锐利阴影、无圆角
 * - 机械感：强调色 (#facc15)、等宽字体、编号系统
 * - 双栏布局：左侧聊天流 (55%) + 右侧编排器 (45%)
 *
 * [布局结构]
 * ┌─────────────────────────────────────────────┐
 * │ Header (由父组件直接提供)                   │
 * ├──────────────────┬──────────────────────────┤
 * │                  │                          │
 * │  Chat Stream     │  Orchestrator           │
 * │  Panel (55%)     │  Panel (45%)            │
 * │                  │                          │
 * └──────────────────┴──────────────────────────┘
 *
 * [响应式设计]
 * - 桌面端 (md+): 双栏并排显示
 * - 移动端: 单栏，底部切换按钮切换 Chat/Preview 视图
 *
 * [使用示例]
 * ```tsx
 * // Header 由父组件直接渲染，不通过 header prop 传递
 * <div className="h-full flex flex-col">
 *   <Header />
 *   <IndustrialChatLayout
 *     chatStreamPanel={<ChatStreamPanel />}
 *     orchestratorPanel={<OrchestratorPanel />}
 *     viewMode="chat"
 *     onViewModeChange={(mode) => setViewMode(mode)}
 *   />
 * </div>
 * ```
 */
interface IndustrialChatLayoutProps {
  /** 左侧聊天流面板 */
  chatStreamPanel: ReactNode
  /** 右侧编排器面板 */
  orchestratorPanel: ReactNode
  /** 是否隐藏右侧面板 (桌面端用) */
  hideOrchestrator?: boolean
  /** 当前视图模式 (移动端用) */
  viewMode?: 'chat' | 'preview'
  /** 切换视图模式 */
  onViewModeChange?: (mode: 'chat' | 'preview') => void
}

export default function IndustrialChatLayout({
  chatStreamPanel,
  orchestratorPanel,
  hideOrchestrator = false,
  viewMode = 'chat',
  onViewModeChange,
}: IndustrialChatLayoutProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-panel font-sans selection:bg-[var(--accent)] selection:text-primary">
      {/* Header 由父组件直接提供，不在此层渲染容器 */}

      {/* 主内容区 - 双栏布局 */}
      <main className="flex-1 flex overflow-hidden">
        {/* 左侧：聊天流面板 (55%) */}
        <div
          className={cn(
            'flex-1 flex flex-col min-w-0 border-r-2 border-border bg-panel relative',
            // 移动端：当 viewMode 为 preview 时隐藏左栏
            viewMode === 'preview' && 'hidden md:flex'
          )}
        >
          {chatStreamPanel}
        </div>

        {/* 右侧：编排器面板 (45%) - 无左边框，避免与左侧的右边框重叠 */}
        <div
          className={cn(
            'w-full md:w-[45%] flex bg-card',
            // 移动端：默认隐藏，viewMode 为 preview 时显示
            viewMode === 'chat' && 'hidden md:flex',
            hideOrchestrator && 'hidden'
          )}
        >
          {orchestratorPanel}
        </div>
      </main>

      {/* 移动端视图切换按钮 */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-card border-2 border-border p-1 shadow-hard">
        <button
          onClick={() => onViewModeChange?.('chat')}
          className={cn(
            'px-4 py-2 text-[10px] font-bold uppercase transition-all',
            viewMode === 'chat'
              ? 'bg-primary text-inverted'
              : 'bg-transparent text-secondary hover:text-primary'
          )}
        >
          Chat
        </button>
        <button
          onClick={() => onViewModeChange?.('preview')}
          className={cn(
            'px-4 py-2 text-[10px] font-bold uppercase transition-all',
            viewMode === 'preview'
              ? 'bg-primary text-inverted'
              : 'bg-transparent text-secondary hover:text-primary'
          )}
        >
          Preview
        </button>
      </div>
    </div>
  )
}
