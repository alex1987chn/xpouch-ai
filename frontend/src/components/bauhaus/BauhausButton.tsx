import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * BauhausButton - 包豪斯风格按钮
 * 
 * 复刻 xpouch_ultra_refined.html 中的 .bauhaus-btn 样式：
 * - border: 2px solid var(--border-color)
 * - background: var(--bg-card)
 * - box-shadow: var(--shadow-color) 4px 4px 0 0
 * - hover: 位移 + 阴影变黄色 + 背景变黄
 * - active: 位移(2px, 2px) + 阴影消失
 * 
 * @example
 * <BauhausButton>Click Me</BauhausButton>
 * <BauhausButton variant="primary">Primary</BauhausButton>
 * <BauhausButton size="lg">Large</BauhausButton>
 */

export interface BauhausButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "ghost"
  size?: "sm" | "md" | "lg"
  asChild?: boolean
}

const BauhausButton = React.forwardRef<HTMLButtonElement, BauhausButtonProps>(
  ({ className, variant = "default", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // 基础几何 - 来自 HTML
          "relative inline-flex items-center justify-center gap-2",
          "border-2 border-[var(--border-color)]",
          "font-bold tracking-wider",
          "transition-all duration-100",
          
          // 变体样式
          variant === "default" && [
            "bg-[var(--bg-card)] text-[var(--text-primary)]",
            "shadow-[var(--shadow-color)_4px_4px_0_0]",
            // Hover: 位移 + 阴影变黄色 + 背景变黄
            "hover:translate-x-[-2px] hover:translate-y-[-2px]",
            "hover:shadow-[var(--accent-hover)_6px_6px_0_0]",
            "hover:bg-[var(--accent-hover)] hover:text-black hover:border-black",
            // Active: 位移 + 阴影消失
            "active:translate-x-[2px] active:translate-y-[2px]",
            "active:shadow-none",
          ],
          
          variant === "primary" && [
            "bg-[var(--text-primary)] text-[var(--bg-card)]",
            "border-[var(--text-primary)]",
            "shadow-none",
            // Hover: 变黄 + 出阴影
            "hover:bg-[var(--accent-hover)] hover:text-black hover:border-black",
            "hover:shadow-[4px_4px_0_0_black]",
            "hover:translate-x-[-2px] hover:translate-y-[-2px]",
            // Active
            "active:translate-x-[2px] active:translate-y-[2px]",
            "active:shadow-none",
          ],
          
          variant === "ghost" && [
            "bg-transparent border-transparent shadow-none",
            "hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]",
            "active:translate-x-0 active:translate-y-0",
          ],
          
          // 尺寸
          size === "sm" && "px-4 py-2 text-xs",
          size === "md" && "px-6 py-3 text-sm",
          size === "lg" && "px-8 py-4 text-base",
          
          // 禁用状态
          "disabled:pointer-events-none disabled:opacity-50",
          
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
BauhausButton.displayName = "BauhausButton"

export { BauhausButton }
