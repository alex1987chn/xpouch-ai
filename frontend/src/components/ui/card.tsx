/**
 * ============================================
 * Card Component - 卡片组件
 * ============================================
 * 
 * Bauhaus 风格卡片：粗边框、硬阴影、悬停效果
 * 使用语义化颜色系统
 */

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Card 根组件
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // 基础样式：边框、背景、文字颜色
      "border-2 border-border-default bg-surface-card text-content-primary",
      // Bauhaus 硬阴影（默认黑色）
      "shadow-[rgb(var(--shadow-color))_6px_6px_0_0]",
      // 动画
      "transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
      // 悬停效果：位移 + 黄色大阴影 + 黄色边框
      "hover:-translate-x-1.5 hover:-translate-y-1.5 hover:shadow-[rgb(var(--accent-hover))_10px_10px_0_0] hover:border-accent",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

/**
 * CardHeader 头部区域
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

/**
 * CardTitle 标题
 */
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight text-content-primary",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

/**
 * CardDescription 描述文字
 */
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-content-secondary", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

/**
 * CardContent 内容区域
 */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

/**
 * CardFooter 底部区域
 */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
