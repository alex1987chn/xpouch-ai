/**
 * ============================================
 * Button Component - 按钮组件
 * ============================================
 * 
 * 使用新的语义化颜色系统，完全主题无关
 * 支持透明度修饰符（如 bg-surface-card/50）
 */

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * 按钮变体样式定义
 * 使用语义变量：surface-*, content-*, border-*, accent-*
 */
const buttonVariants = cva(
  // 基础样式
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold tracking-wide " +
  "ring-offset-surface-page transition-all duration-fast " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /**
         * 默认变体 - Bauhaus 风格硬阴影按钮
         */
        default: [
          // 基础状态
          "bg-surface-card border-2 border-border-default text-content-primary",
          "shadow-hard",
          // 悬停状态
          "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-lg hover:bg-accent hover:text-content-inverted hover:border-border-focus",
          // 激活状态
          "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        ],

        /**
         * 次要变体
         */
        secondary: [
          "bg-surface-elevated text-content-primary",
          "hover:bg-surface-card hover:text-accent",
        ],

        /**
         * 轮廓变体 - 带边框但无背景填充
         */
        outline: [
          "bg-surface-card border-2 border-border-default text-content-primary",
          "shadow-hard",
          "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-lg hover:bg-accent hover:text-content-inverted hover:border-border-focus",
          "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        ],

        /**
         * 幽灵变体 - 无边框，仅悬停时显示背景
         */
        ghost: [
          "text-content-primary",
          "hover:bg-surface-elevated hover:text-accent",
        ],

        /**
         * 链接变体 - 纯文字链接样式
         */
        link: [
          "text-accent underline-offset-4",
          "hover:underline",
        ],

        /**
         * 危险变体 - 删除/警告操作
         */
        destructive: [
          "bg-accent-destructive text-content-inverted",
          "hover:bg-accent-destructive/90",
        ],

        /**
         * 品牌主色变体
         */
        brand: [
          "bg-accent text-content-inverted border-2 border-border-focus",
          "shadow-hard",
          "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-lg hover:bg-accent-hover",
          "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
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
