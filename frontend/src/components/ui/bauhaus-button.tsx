import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * BauhausButton - 包豪斯风格按钮
 * 
 * 设计特点：
 * - 直角无圆角 (rounded-none)
 * - 粗边框 (border-2)
 * - 硬阴影 (shadow-hard)
 * - 按压效果 (active:translate-x-1 active:translate-y-1 active:shadow-none)
 * 
 * @example
 * <BauhausButton>点击我</BauhausButton>
 * <BauhausButton variant="yellow">黄色强调</BauhausButton>
 * <BauhausButton variant="blue">蓝色按钮</BauhausButton>
 * <BauhausButton size="lg">大按钮</BauhausButton>
 */

const bauhausButtonVariants = cva(
  // 基础样式 - 几何构成主义
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "text-sm font-bold uppercase tracking-wider",
    "rounded-none border-2 border-bauhaus-border",
    "transition-all duration-100 ease-out",
    "focus-visible:outline-none focus-visible:ring-0",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    // 硬阴影
    "shadow-hard",
    // 按压效果 - 包豪斯灵魂交互
    "active:translate-x-0.5 active:translate-y-0.5 active:shadow-hard-sm",
  ],
  {
    variants: {
      variant: {
        // 默认：黑底白字
        default: [
          "bg-bauhaus-border text-white",
          "hover:bg-bauhaus-text",
        ],
        // 轮廓：白底黑框
        outline: [
          "bg-bauhaus-card text-bauhaus-border",
          "hover:bg-bauhaus-bg",
        ],
        // Bauhaus 黄：强调色
        yellow: [
          "bg-bauhaus-yellow text-bauhaus-border border-bauhaus-border",
          "hover:brightness-110",
        ],
        // Bauhaus 蓝：主色调
        blue: [
          "bg-bauhaus-blue text-white border-bauhaus-blue",
          "hover:bg-blue-600",
        ],
        // Bauhaus 红：危险/强调
        red: [
          "bg-bauhaus-red text-white border-bauhaus-red",
          "hover:bg-red-600",
        ],
        // 幽灵按钮：无边框背景
        ghost: [
          "bg-transparent text-bauhaus-border border-transparent shadow-none",
          "hover:bg-bauhaus-bg",
          "active:shadow-none active:translate-x-0 active:translate-y-0",
        ],
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        xl: "h-14 px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BauhausButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof bauhausButtonVariants> {
  asChild?: boolean
}

const BauhausButton = React.forwardRef<HTMLButtonElement, BauhausButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(bauhausButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
BauhausButton.displayName = "BauhausButton"

export { BauhausButton, bauhausButtonVariants }
