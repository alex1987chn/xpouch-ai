/**
 * 移动端遮罩层组件
 * 用于侧边栏、弹窗等需要遮罩的场景
 */

import { cn } from '@/lib/utils'
import { Z_INDEX } from '@/constants/zIndex'

interface MobileOverlayProps {
  /** 是否显示遮罩 */
  show: boolean
  /** 点击遮罩的回调 */
  onClick?: () => void
  /** 额外的 CSS 类名 */
  className?: string
}

export default function MobileOverlay({ show, onClick, className }: MobileOverlayProps) {
  if (!show) return null

  return (
    <div
      className={cn(
        'fixed inset-0 bg-black/50 lg:hidden transition-opacity duration-300',
        className
      )}
      style={{ zIndex: Z_INDEX.OVERLAY }}
      onClick={onClick}
      aria-hidden="true"
    />
  )
}
