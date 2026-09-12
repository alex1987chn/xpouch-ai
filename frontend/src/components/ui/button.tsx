/**
 * ============================================
 * Button Component - 按钮组件
 * ============================================
 * 
 * 使用语义化 CSS 变量，完全主题自适应
 * 所有视觉风格由 CSS 变量控制，组件只定义结构
 */

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * 按钮变体样式定义
 * 使用语义化类名：theme-card, theme-button 等
 */
const buttonVariants = cva(
  // 基础样式
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
  "ring-offset-surface-page transition-all duration-fast " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /**
         * 默认变体 - 主题自适应
         */
        default: [
          "bg-surface-card border-theme-button border-border-default text-content-primary",
          "shadow-theme-button",
          "hover:border-border-hover hover:bg-surface-tint",
          "active:translate-y-0 active:shadow-none",
        ],

        /**
         * 次要变体
         */
        secondary: [
          "bg-surface-tint text-content-primary",
          "hover:bg-surface-tint/70",
        ],

        /**
         * 幽灵变体
         */
        ghost: [
          "text-content-primary",
          "hover:bg-surface-tint/70",
        ],

        /**
         * 链接变体
         */
        link: [
          "text-accent underline-offset-4",
          "hover:underline",
        ],

        /**
         * 危险变体
         */
        destructive: [
          "bg-accent-destructive text-content-inverted",
          "hover:bg-accent-destructive/90",
        ],

        /**
         * 品牌主色变体
         */
        brand: [
          "bg-accent-brand text-accent-ink border border-border-divider",
          "hover:bg-accent-hover hover:-translate-y-px hover:shadow-theme-card",
          "active:translate-y-0 active:shadow-none",
        ],

        /**
         * 胶囊次级（v3.5.1 收编全站高频手写胶囊按钮：
         * 灰描边圆角全、暖白底、悬停微位移+卡片影）
         */
        pill: [
          "rounded-full bg-surface-card border border-border-divider text-content-secondary",
          "hover:border-border-hover hover:text-content-primary",
        ],

        /**
         * 胶囊品牌（黄底主行动胶囊）
         */
        pillBrand: [
          "rounded-full bg-accent-brand border border-border-divider text-accent-ink font-bold",
          "hover:-translate-y-px hover:shadow-theme-card",
          "active:translate-y-0 active:shadow-none disabled:translate-y-0 disabled:shadow-none",
        ],

        /**
         * 胶囊危险（红描边破坏性胶囊）
         */
        pillDanger: [
          "rounded-full bg-surface-card border border-status-offline/40 text-status-offline",
          "hover:bg-status-offline/5",
        ],
      },

      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-8 text-base",
        icon: "h-10 w-10",
        /** 胶囊系标准高度（全站 h-9 胶囊按钮） */
        pill: "h-9 px-4 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * 按钮组件属性接口
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** 是否作为子元素渲染 */
  asChild?: boolean
  /** Ref 引用 */
  ref?: React.Ref<HTMLButtonElement>
}

/**
 * Button 组件
 * 
 * @example
 * // 默认按钮
 * <Button>点击我</Button>
 * 
 * @example
 * // 品牌色按钮
 * <Button variant="brand">主操作</Button>
 * 
 * @example
 * // 危险按钮
 * <Button variant="destructive">删除</Button>
 */
function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
}

export { Button, buttonVariants }
