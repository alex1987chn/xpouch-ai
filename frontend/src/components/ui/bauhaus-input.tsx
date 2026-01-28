import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * BauhausInput - 包豪斯风格输入框
 *
 * 设计特点：
 * - 直角无圆角 (rounded-none)
 * - 默认2px边框 (border-2)
 * - Focus时边框变粗且变蓝 (focus:border-4 focus:border-bauhaus-blue)
 * - 移除默认ring效果
 *
 * @example
 * <BauhausInput placeholder="请输入..." />
 * <BauhausInput variant="textarea" rows={4} />
 * <BauhausInput error state /> // 错误状态
 */

export interface BauhausInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const BauhausInput = React.forwardRef<HTMLInputElement, BauhausInputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // 基础布局
          "flex h-12 w-full",
          // 直角无圆角
          "rounded-none",
          // 边框 - 默认2px
          "border-2 border-bauhaus-border",
          // Focus状态 - 边框变粗且变蓝
          "focus:border-4 focus:border-bauhaus-blue",
          // 移除默认outline和ring
          "focus-visible:outline-none focus-visible:ring-0",
          // 背景色
          "bg-bauhaus-input",
          // 文本样式
          "px-4 py-2 text-sm font-medium",
          "text-bauhaus-text placeholder:text-bauhaus-muted",
          // 过渡动画
          "transition-all duration-150 ease-out",
          // 禁用状态
          "disabled:cursor-not-allowed disabled:opacity-50",
          // 错误状态
          error && "border-bauhaus-red focus:border-bauhaus-red",
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
        // 边框 - 默认2px
        "border-2 border-bauhaus-border",
        // Focus状态 - 边框变粗且变蓝
        "focus:border-4 focus:border-bauhaus-blue",
        // 移除默认outline和ring
        "focus-visible:outline-none focus-visible:ring-0",
        // 背景色
        "bg-bauhaus-input",
        // 文本样式
        "px-4 py-3 text-sm font-medium",
        "text-bauhaus-text placeholder:text-bauhaus-muted",
        // 过渡动画
        "transition-all duration-150 ease-out",
        // 禁用状态
        "disabled:cursor-not-allowed disabled:opacity-50",
        // 错误状态
        error && "border-bauhaus-red focus:border-bauhaus-red",
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
      "text-sm font-bold uppercase tracking-wider text-bauhaus-text",
      className
    )}
    {...props}
  />
))
BauhausLabel.displayName = "BauhausLabel"

export { BauhausInput, BauhausTextarea, BauhausLabel }
