import { cn } from '@/lib/utils'
import { PROGRESS } from '@/constants/ui'

interface PixelProgressBarProps {
  current: number
  max: number
}

export default function PixelProgressBar({ current, max }: PixelProgressBarProps) {
  const progress = Math.min(current / max, 1)
  const filledCount = Math.floor(progress * PROGRESS.PIXEL_COUNT)

  return (
    <div className="space-y-2">
      {/* 像素进度条 */}
      <div className="flex items-center gap-1">
        {/* 已填充的像素块 */}
        {Array.from({ length: PROGRESS.PIXEL_COUNT }).map((_, i) => {
          const isFilled = i < filledCount
          const delay = i * 0.02

          return (
            <div
              key={i}
              className={cn(
                'w-4 h-2 rounded-[2px] transition-all duration-300',
                isFilled
                  ? 'bg-gradient-to-r from-blue-400 via-indigo-500 to-violet-500'
                  : 'bg-slate-200 dark:bg-slate-700'
              )}
              style={{
                opacity: isFilled ? 1 : undefined,
                animationDelay: `${delay}s`
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
