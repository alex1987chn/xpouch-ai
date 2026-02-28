import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * BauhausInput - 包豪斯风格输入框
 *
 * 设计特点：
 * - 直角无圆角 (rounded-none)
 * - 2px边框 (border-2)
 * - Focus时边框变色（不变粗）
 * - mono 字体
 * - 使用 page 背景色
 *
 * @example
 * <BauhausInput placeholder="请输入..." />
 * <BauhausInput variant="ghost" placeholder="透明背景..." />
 * <BauhausInput error /> // 错误状态
 * <BauhausSearchInput value={value} onChange={setValue} /> // 搜索框
 */

export interface BauhausInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  variant?: "default" | "ghost"
}

const BauhausInput = React.forwardRef<HTMLInputElement, BauhausInputProps>(
  ({ className, type, error, variant = "default", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // 基础布局
          "flex w-full h-12",
          // 直角无圆角
          "rounded-none",
          // 边框
          "border-2 border-border-default",
          // Focus状态 - 只变色不变粗（统一风格）
          "focus:outline-none",
          variant === "default" && "focus:border-accent-info",
          variant === "ghost" && "focus:border-border-default",
          // 背景色
          variant === "ghost" ? "bg-transparent" : "bg-surface-page",
          // 字体 - mono（统一风格）
          "px-4 py-2 font-mono text-sm",
          "text-content-primary placeholder:text-content-secondary",
          // 过渡动画
          "transition-colors duration-150 ease-out",
          // 禁用状态
          "disabled:cursor-not-allowed disabled:opacity-50",
          // 错误状态
          error && "border-accent-destructive focus:border-accent-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
BauhausInput.displayName = "BauhausInput"

/**
 * BauhausSearchInput - 包豪斯风格搜索框
 * 
 * 带搜索图标的输入框，黄色 focus 边框
 */
export interface BauhausSearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string
  onChange: (value: string) => void
  error?: boolean
}

const BauhausSearchInput = React.forwardRef<
  HTMLInputElement,
  BauhausSearchInputProps
>(({ className, value, onChange, error, ...props }, ref) => {
  return (
    <div className="relative flex items-center w-full">
      <Search className="absolute left-3 w-4 h-4 text-content-secondary pointer-events-none z-10" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          // 基础布局
          "flex w-full h-11",
          // 直角无圆角
          "rounded-none",
          // 边框
          "border-2 border-border-default",
          // Focus状态 - 只变色不变粗（与其他页面一致）
          "focus:outline-none focus:border-accent-brand",
          // 背景色 - 使用 page 背景（与其他页面一致）
          "bg-surface-page",
          // 字体 - mono（与其他页面一致）
          "pl-10 pr-4 py-2 font-mono text-sm",
          "text-content-primary placeholder:text-content-secondary",
          // 过渡动画
          "transition-colors duration-150 ease-out",
          // 禁用状态
          "disabled:cursor-not-allowed disabled:opacity-50",
          // 错误状态
          error && "border-accent-destructive focus:border-accent-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    </div>
  )
})
BauhausSearchInput.displayName = "BauhausSearchInput"

/**
 * BauhausTextarea - 包豪斯风格文本域
 */
export interface BauhausTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

const BauhausTextarea = React.forwardRef<
  HTMLTextAreaElement,
  BauhausTextareaProps
>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // 基础布局
        "flex min-h-[80px] w-full",
        // 直角无圆角
        "rounded-none",
        // 边框
        "border-2 border-border-default",
        // Focus状态 - 只变色不变粗
        "focus:outline-none focus:border-accent-info",
        // 背景色 - 使用 page 背景
        "bg-surface-page",
        // 字体 - mono
        "px-4 py-3 font-mono text-sm",
        "text-content-primary placeholder:text-content-secondary",
        // 过渡动画
        "transition-colors duration-150 ease-out",
        // 禁用状态
        "disabled:cursor-not-allowed disabled:opacity-50",
        // 错误状态
        error && "border-accent-destructive focus:border-accent-destructive",
        // resize控制
        "resize-y",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
BauhausTextarea.displayName = "BauhausTextarea"

/**
 * BauhausLabel - 包豪斯风格标签
 */
const BauhausLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-bold uppercase tracking-wider text-content-primary",
      className
    )}
    {...props}
  />
))
BauhausLabel.displayName = "BauhausLabel"

export { BauhausInput, BauhausSearchInput, BauhausTextarea, BauhausLabel }
