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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium tracking-wide " +
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
          "bg-surface-card border-2 border-border-default text-content-primary",
          "shadow-theme-button",
          "hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover hover:bg-accent hover:text-content-inverted hover:border-border-focus",
          "active:[transform:var(--transform-button-active)] active:shadow-theme-button-active",
        ],

        /**
         * 次要变体
         */
        secondary: [
          "bg-surface-elevated text-content-primary",
          "hover:bg-surface-card hover:text-accent",
        ],

        /**
         * 轮廓变体
         */
        outline: [
          "bg-surface-card border-2 border-border-default text-content-primary",
          "shadow-theme-button",
          "hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover hover:bg-accent hover:text-content-inverted hover:border-border-focus",
          "active:[transform:var(--transform-button-active)] active:shadow-theme-button-active",
        ],

        /**
         * 幽灵变体
         */
        ghost: [
          "text-content-primary",
          "hover:bg-surface-elevated hover:text-accent",
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
          "bg-accent text-content-inverted border border-border-focus",
          "shadow-theme-button",
          "hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover hover:bg-accent-hover",
          "active:[transform:var(--transform-button-active)] active:shadow-theme-button-active",
        ],
      },
      
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-8 text-base",
        icon: "h-10 w-10",
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
