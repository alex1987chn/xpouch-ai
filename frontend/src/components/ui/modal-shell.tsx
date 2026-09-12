/**
 * ModalShell - 自研弹窗统一壳（Portal + 遮罩 + 面板 + 焦点/Esc）
 *
 * [职责] 只负责弹窗的"外壳"：挂载点、遮罩（surface-scrim/45，蓝本
 * rgba(24,20,16,.45)）、层级（Z_INDEX.MODAL）、Esc 关闭、焦点陷阱与归还。
 * 面板布局（宽高/圆角/头部正文结构）由使用方通过 panelClassName 决定，
 * 本组件不掺业务样式。
 *
 * [约定] 遮罩点击关闭 = 点在遮罩自身（e.target === currentTarget）；
 * 提交中传 dismissable=false 同时锁住 Esc 与遮罩点击。
 */

import { createPortal } from 'react-dom'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import { Z_INDEX } from '@/constants/zIndex'
import { cn } from '@/lib/utils'

interface ModalShellProps {
  open: boolean
  onClose: () => void
  /** 面板内标题元素 id（aria-labelledby） */
  labelledBy?: string
  /** 面板布局类（宽高/圆角/滚动） */
  panelClassName?: string
  /** false 时锁定 Esc 与遮罩点击（提交中等） */
  dismissable?: boolean
  children: React.ReactNode
}

export function ModalShell({
  open, onClose, labelledBy, panelClassName, dismissable = true, children,
}: ModalShellProps) {
  useEscapeToClose(open && dismissable, onClose)
  const a11y = useDialogA11y<HTMLDivElement>(open, labelledBy)

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-surface-scrim/45 p-4 animate-in fade-in"
      style={{ zIndex: Z_INDEX.MODAL }}
      onMouseDown={e => { if (dismissable && e.target === e.currentTarget) onClose() }}
    >
      <div
        {...a11y}
        aria-labelledby={labelledBy}
        className={cn('rounded-xl border border-border-default bg-surface-card shadow-theme-modal', panelClassName)}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
