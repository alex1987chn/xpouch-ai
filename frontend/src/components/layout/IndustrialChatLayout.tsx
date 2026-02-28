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
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Header (由父组件直接提供)                                   │
 * ├────────────────────────────┬────────────────────────────────┤
 * │                            │                                │
 * │  Chat Stream Panel         │  Orchestrator Panel            │
 * │  (flex-1, min-w-[400px])   │  (45%-50%, min-w-[400px])      │
 * │                            │  = BusRail (w-16) + Artifact   │
 * │                            │                                │
 * └────────────────────────────┴────────────────────────────────┘
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
  /** 是否全屏模式 (右侧面板占满屏幕) */
  isFullscreen?: boolean
}

export default function IndustrialChatLayout({
  chatStreamPanel,
  orchestratorPanel,
  hideOrchestrator = false,
  viewMode = 'chat',
  onViewModeChange,
  isFullscreen = false,
}: IndustrialChatLayoutProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-surface-card font-sans selection:bg-[rgb(var(--accent-brand))] selection:text-content-primary">
      {/* Header 由父组件直接提供，不在此层渲染容器 */}

      {/* 主内容区 - 双栏布局 */}
      <main className="flex-1 flex overflow-hidden">
        {/* 左侧：聊天流面板 (55% -> 大屏 50%) */}
        <div
          className={cn(
            'flex-1 flex flex-col min-w-[400px] border-r-2 border-border bg-surface-card relative',
            // 移动端：当 viewMode 为 preview 时隐藏左栏
            viewMode === 'preview' && 'hidden md:flex',
            // 全屏时隐藏左栏（确保在移动端和桌面端都隐藏）
            isFullscreen && 'hidden md:hidden'
          )}
        >
          {chatStreamPanel}
        </div>

        {/* 右侧：编排器面板 (55% - 全屏时占满宽度) - 无左边框，避免与左侧的右边框重叠 */}
        <div
          className={cn(
            'w-full md:w-[55%] flex bg-card min-w-[400px]',
            // 移动端：默认隐藏，viewMode 为 preview 时显示
            viewMode === 'chat' && 'hidden md:flex',
            // 隐藏右侧面板
            hideOrchestrator && 'hidden',
            // 全屏时占满宽度
            isFullscreen && '!w-full !md:!w-full !min-w-0'
          )}
        >
          {orchestratorPanel}
        </div>
      </main>

      {/* 移动端视图切换按钮已移到 HeavyInputConsole 工具栏 */}
    </div>
  )
}
