import React from 'react'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Dialog, DialogContent, DialogPortal, DialogOverlay } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Z_INDEX } from '@/constants/zIndex'

/**
 * ExpertResult 接口定义
 * 来自 @/store/canvasStore
 */
export interface ExpertResult {
  expertType: string
  title?: string
  description?: string // 任务描述
  status: string // 'pending' | 'running' | 'completed' | 'failed'
  output?: string // 执行结果
  duration_ms?: number // 耗时（毫秒）
  error?: string
}

interface ExpertDetailModalProps {
  isOpen: boolean
  onClose: () => void
  expert: ExpertResult | null
}

/**
 * =============================
 * 专家执行报告弹窗 (ExpertDetailModal)
 * =============================
 *
 * [架构层级] Layer 6 - 交互组件
 *
 * [功能描述]
 * 显示专家执行详情的"执行报告"，包括：
 * - 任务状态（完成/失败/运行中）
 * - 执行耗时（Duration）
 * - 执行输出或错误信息
 *
 * [设计风格] Execution Report Console
 * - 双栏布局：Meta Panel (200px) + Output Console (flex-1)
 * - 工业风格：硬边框、等宽字体、状态指示器
 * - 使用 shadcn/ui Dialog 作为基础，覆盖样式以匹配 Bauhaus 风格
 *
 * [使用示例]
 * ```tsx
 * <ExpertDetailModal
 *   isOpen={showPreviewModal}
 *   onClose={handleCloseModal}
 *   expert={previewExpert}
 * />
 * ```
 */
export function ExpertDetailModal({ isOpen, onClose, expert }: ExpertDetailModalProps) {
  if (!expert) return null

  // 格式化耗时（秒）
  const duration = expert.duration_ms ? `${(expert.duration_ms / 1000).toFixed(2)}s` : '--'

  // 状态颜色
  const getStatusColor = () => {
    switch (expert.status) {
      case 'completed':
        return 'text-green-500'
      case 'failed':
        return 'text-red-500'
      case 'running':
        return 'text-yellow-500'
      default:
        return 'text-secondary'
    }
  }

  // 状态图标
  const getStatusIcon = () => {
    switch (expert.status) {
      case 'completed':
        return <CheckCircle2 className="w-8 h-8 text-green-500" />
      case 'failed':
        return <XCircle className="w-8 h-8 text-red-500" />
      default:
        return <Clock className="w-8 h-8 text-yellow-500" />
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        <DialogOverlay className="z-[var(--z-index-modal)] bg-primary/50" />
        <DialogContent
          className="
            /* 覆盖 shadcn 默认样式：去圆角，加粗边，加硬阴影 */
            sm:max-w-[800px]
            bg-card
            border-2 border-border
            shadow-hard-lg
            p-0
            gap-0
            rounded-none
            overflow-hidden
            left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full
            data-[state=open]:animate-in data-[state=closed]:animate-out
          "
          style={{ zIndex: Z_INDEX.MODAL }}
          onPointerDownOutside={(e) => {
            // 防止点击内容区关闭
            if (e.target === e.currentTarget) {
              onClose()
            }
          }}
        >
          {/* 1. 工业风标题栏 */}
          <div className="bg-[var(--accent)] h-12 flex items-center px-4 border-b-2 border-border justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-primary" />
              <span className="font-mono text-xs font-bold text-primary uppercase tracking-wider">
                TASK_LOG :: {expert.expertType.toUpperCase()}
              </span>
            </div>
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center border-2 border-primary hover:bg-primary hover:text-[var(--accent)] transition-colors"
            >
              <span className="font-mono text-xs font-bold">×</span>
            </button>
          </div>

          {/* 2. 内容区（双栏布局） */}
          <div className="flex h-[450px]">
            {/* 左栏：Meta Panel (200px) */}
            <div className="w-[200px] bg-panel border-r-2 border-border p-6 flex flex-col items-center gap-6 shrink-0">
              {/* 状态图标 */}
              <div className="flex flex-col items-center gap-2">
                {getStatusIcon()}
                <span className={cn('font-mono text-xs font-bold uppercase', getStatusColor())}>
                  {expert.status}
                </span>
              </div>

              {/* 执行耗时 */}
              <div className="w-full">
                <div className="font-mono text-[10px] text-secondary uppercase mb-1">/// DURATION</div>
                <div className="bg-card border border-border/30 px-3 py-2 font-mono text-sm">
                  {duration}
                </div>
              </div>

              {/* 专家类型 */}
              <div className="w-full">
                <div className="font-mono text-[10px] text-secondary uppercase mb-1">/// EXPERT</div>
                <div className="bg-card border border-border/30 px-3 py-2 font-mono text-xs">
                  {expert.expertType.toUpperCase()}
                </div>
              </div>
            </div>

            {/* 右栏：Output Console (flex-1) */}
            <div className="flex-1 bg-card flex flex-col">
              <div className="bg-panel h-8 flex items-center px-4 border-b border-border/30 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm bg-[var(--accent)]" />
                  <span className="font-mono text-[10px] text-secondary uppercase font-bold">
                    OUTPUT_CONSOLE
                  </span>
                </div>
              </div>
              <ScrollArea className="flex-1 p-4">
                {expert.error ? (
                  <div className="bg-red-50 border-2 border-red-500 p-4 font-mono text-xs text-red-600">
                    <div className="font-mono text-[10px] text-red-500 uppercase mb-2">/// ERROR</div>
                    <pre className="whitespace-pre-wrap">{expert.error}</pre>
                  </div>
                ) : expert.output ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                    {expert.output}
                  </pre>
                ) : expert.description ? (
                  <div className="text-sm leading-relaxed">
                    <div className="font-mono text-[10px] text-secondary uppercase mb-2">/// TASK_DESCRIPTION</div>
                    <p>{expert.description}</p>
                  </div>
                ) : (
                  <div className="text-secondary text-xs">No output available</div>
                )}
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
