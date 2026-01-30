import { ArrowLeft } from 'lucide-react'

interface SwipeBackIndicatorProps {
  swipeProgress: number
}

export default function SwipeBackIndicator({ swipeProgress }: SwipeBackIndicatorProps) {
  // 最大滑动距离限制为 150px
  const width = Math.min(swipeProgress, 150)

  if (swipeProgress <= 0) {
    return null
  }

  return (
    <div
      className="md:hidden absolute left-0 top-0 bottom-0 flex items-center justify-center bg-gradient-to-r from-indigo-500/30 to-transparent backdrop-blur-sm pointer-events-none z-50 transition-all"
      style={{ width: `${width}px` }}
    >
      <ArrowLeft className="w-8 h-8 text-indigo-600 ml-3 opacity-90" />
    </div>
  )
}
