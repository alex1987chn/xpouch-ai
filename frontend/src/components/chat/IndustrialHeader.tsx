import React from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VERSION } from '@/constants/ui'

interface IndustrialHeaderProps {
  title?: string
  version?: string
  status?: 'online' | 'offline' | 'busy'
  onClose?: () => void
  className?: string
}

/**
 * =============================
 * 工业风格头部组件 (IndustrialHeader)
 * =============================
 *
 * [架构层级] Layer 5 - 页面头部
 *
 * [功能描述]
 * 显示应用标题和系统状态，包括：
 * - Logo 和版本号
 * - 系统状态指示器（在线/离线/忙碌）
 * - 关闭按钮（可选）
 *
 * [样式风格] Bauhaus Industrial
 * - 固定高度 h-14
 * - 硬边框 border-2
 * - 底部边框 border-b-2
 *
 * [使用示例]
 * ```tsx
 * <IndustrialHeader
 *   title="XPOUCH_OS"
 *   version={VERSION.CURRENT}
 *   status="online"
 *   onClose={() => navigate('/')}
 * />
 * ```
 */
export function IndustrialHeader({
  title = 'XPOUCH_OS',
  version = VERSION.CURRENT,
  status = 'online',
  onClose,
  className
}: IndustrialHeaderProps) {
  return (
    <header
      className={cn(
        // 核心样式：高度固定、底边框、背景色、flex布局
        'h-12 shrink-0 border-b-2 border-border bg-card flex items-center justify-between px-4 select-none',
        className
      )}
    >
      {/* 左侧：Logo 与 标题 */}
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 bg-primary text-[var(--accent)] flex items-center justify-center font-bold text-xs">
          X
        </div>
        <span className="font-black text-lg tracking-tighter text-primary">
          {title}
          <span className="text-[10px] font-mono text-primary/60 dark:text-primary/50 font-normal ml-2">
            {version}
          </span>
        </span>
      </div>

      {/* 右侧：系统状态指示器 + 关闭按钮 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1 bg-panel dark:bg-panel/80 border border-border/20">
          <div
            className={cn(
              'w-2 h-2 rounded-full animate-pulse',
              status === 'online'
                ? 'bg-green-500'
                : status === 'busy'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            )}
          />
          <span className="font-mono text-[10px] text-primary/70 dark:text-primary/60 font-bold uppercase">
            SYSTEM: {status}
          </span>
        </div>

        {/* 关闭按钮（仅当 onClose 存在时渲染） */}
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border-2 border-border hover:bg-red-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  )
}
