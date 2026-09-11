/**
 * ============================================
 * Input Component - 输入框组件
 * ============================================
 * 
 * 使用语义化 CSS 变量，完全主题自适应
 * 圆角、边框宽度、阴影由主题变量控制
 */

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input - 主题自适应输入框
 */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  variant?: "default" | "ghost"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, variant = "default", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // 基础布局
          "flex w-full h-12",
          // 圆角（主题自适应）
          "rounded-md",
          // 边框（主题自适应）
          "border-theme-input border-border-default",
          // Focus状态
          "focus:outline-none focus:border-border-focus",
          // 背景色
          variant === "ghost" ? "bg-transparent" : "bg-surface-page",
          // 字体
          "px-4 py-2 text-sm",
          "text-content-primary placeholder:text-content-muted",
          // 阴影（主题自适应）
          "shadow-theme-input",
          // 过渡动画
          "transition-all duration-150 ease-out",
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
Input.displayName = "Input"

/**
 * SearchInput - 统一搜索组件（全站唯一搜索形态）
 *
 * 无图标的纯胶囊（placeholder 即语义）；size 变体：
 * - default（h-9）：内容页标题行右槽（w-72 由调用方定）
 * - compact（h-8，13px）：面板内/窄栏（会话地层等）
 * 位置规范：搜索住在标题行右侧，不单独漂一行。
 */
export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "size"> {
  value: string
  onChange: (value: string) => void
  error?: boolean
  size?: "default" | "compact"
}

const SearchInput = React.forwardRef<
  HTMLInputElement,
  SearchInputProps
>(({ className, value, onChange, error, size = "default", ...props }, ref) => {
  const compact = size === "compact"
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        // 布局：胶囊
        "flex w-full rounded-full",
        compact ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm",
        // 边框 + Focus
        "border-theme-input border-border-default bg-surface-page",
        "focus:border-border-focus focus:outline-none",
        // 文字
        "text-content-primary placeholder:text-content-muted",
        // 过渡
        "transition-colors duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // 错误状态
        error && "border-accent-destructive focus:border-accent-destructive",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
SearchInput.displayName = "SearchInput"

/**
 * Textarea - 主题自适应文本域
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // 基础布局
        "flex min-h-[80px] w-full",
        // 圆角
        "rounded-md",
        // 边框
        "border-theme-input border-border-default",
        // Focus状态
        "focus:outline-none focus:border-accent-info",
        // 背景色
        "bg-surface-page",
        // 字体
        "px-4 py-3 text-sm",
        "text-content-primary placeholder:text-content-muted",
        // 阴影
        "shadow-theme-input",
        // 过渡动画
        "transition-all duration-150 ease-out",
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
Textarea.displayName = "Textarea"

/**
 * Label - 表单标签
 */
const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium text-content-primary",
      className
    )}
    {...props}
  />
))
Label.displayName = "Label"

// 向后兼容导出
export { Input, SearchInput, Textarea, Label }

// 旧名称兼容（逐步淘汰）
export { Input as ThemeInput, SearchInput as ThemeSearchInput, Textarea as ThemeTextarea, Label as ThemeLabel }
