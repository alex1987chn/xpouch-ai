/**
 * ============================================
 * Input Component - 输入框组件
 * ============================================
 * 
 * 使用语义化 CSS 变量，完全主题自适应
 * 圆角、边框宽度、阴影由主题变量控制
 */

import * as React from "react"
import { Search } from "lucide-react"

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
          "border-2 border-border-default",
          // Focus状态
          "focus:outline-none focus:border-border-focus",
          // 背景色
          variant === "ghost" ? "bg-transparent" : "bg-surface-page",
          // 字体
          "px-4 py-2 text-sm",
          "text-content-primary placeholder:text-content-secondary",
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
 * SearchInput - 带搜索图标的输入框
 */
export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string
  onChange: (value: string) => void
  error?: boolean
}

const SearchInput = React.forwardRef<
  HTMLInputElement,
  SearchInputProps
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
          // 圆角
          "rounded-md",
          // 边框
          "border-2 border-border-default",
          // Focus状态
          "focus:outline-none focus:border-border-focus",
          // 背景色
          "bg-surface-page",
          // 字体
          "pl-10 pr-4 py-2 text-sm",
          "text-content-primary placeholder:text-content-secondary",
          // 阴影
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
    </div>
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
        "border-2 border-border-default",
        // Focus状态
        "focus:outline-none focus:border-accent-info",
        // 背景色
        "bg-surface-page",
        // 字体
        "px-4 py-3 text-sm",
        "text-content-primary placeholder:text-content-secondary",
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
