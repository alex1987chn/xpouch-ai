/**
 * Spinner - 统一加载指示基础件
 *
 * [背景] 此前 4 种内联写法并存：lucide Loader2、CSS 圆环 ×2 规格、字符 ⟳。
 * 本组件收编圆环族（带 border 的那种）；lucide Loader2 图标族保持原样
 * （它本身是统一模式，且常与文字并排）。几何口径与 DESIGN-SPEC 的
 * 「控件几何除外」条款一致：环用 border 画，不受全局禁直角约束。
 */

import { cn } from '@/lib/utils'

interface SpinnerProps {
  /** 视觉尺寸（像素档） */
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

const SIZE_CLASS: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'h-3 w-3 border',
  sm: 'h-3.5 w-3.5 border',
  md: 'h-4 w-4 border-2',
}

export function Spinner({ size = 'sm', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={cn(
        'inline-block animate-spin rounded-full border-accent-ink/30 border-t-accent-ink',
        SIZE_CLASS[size],
        className,
      )}
    />
  )
}
