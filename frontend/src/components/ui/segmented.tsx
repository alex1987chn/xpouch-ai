/**
 * Segmented - 分段胶囊（蓝本 .seg 语法）
 *
 * 行为芯 = Radix ToggleGroup（单选语义 + 键盘导航白送），
 * 视觉 = 全站分段胶囊（surface-tint 选中 + 边框分隔）。
 * 收编此前 6 处手写分段（ThemeSwitcher/语言切换/视图切换等）。
 *
 * @example 受控单选
 * <Segmented value={tab} onValueChange={setTab}
 *   options={[{ value: 'view', label: '视图' }, { value: 'code', label: '代码' }]} />
 */

import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { cn } from '@/lib/utils'

export interface SegmentedOption<V extends string> {
  value: V
  label: React.ReactNode
  title?: string
  disabled?: boolean
}

interface SegmentedProps<V extends string> {
  value: V
  onValueChange: (value: V) => void
  options: SegmentedOption<V>[]
  /** 高度档：sm=28px（页首胶囊）/ md=30px（默认）/ lg=34px（登录页等大触达面） */
  size?: 'sm' | 'md' | 'lg'
  className?: string
  'aria-label'?: string
}

const SIZE_H: Record<NonNullable<SegmentedProps<string>['size']>, string> = {
  sm: 'h-7 text-[11px]',
  md: 'h-[30px] text-xs',
  lg: 'h-[34px] text-[13px]',
}

export function Segmented<V extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<V>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        // Radix 单选在再次点击选中项时会上报空值——分段胶囊语义下忽略
        if (v) onValueChange(v as V)
      }}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center overflow-hidden rounded-full border border-border-default bg-surface-page',
        className
      )}
    >
      {options.map((opt, i) => (
        <ToggleGroup.Item
          key={opt.value}
          value={opt.value}
          title={opt.title}
          disabled={opt.disabled}
          className={cn(
            'h-full px-2.5 transition-colors',
            SIZE_H[size],
            i > 0 && 'border-l border-border-divider',
            value === opt.value
              ? 'bg-surface-tint font-bold text-content-primary'
              : 'font-medium text-content-muted hover:text-content-primary'
          )}
        >
          {opt.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
