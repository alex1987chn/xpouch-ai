import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * BauhausCard - 包豪斯风格卡片
 * 
 * 设计特点：
 * - 直角无圆角 (rounded-none)
 * - 实线粗边框 (border-2)
 * - 纯实色背景 (bg-surface-card)
 * - 硬阴影 (shadow-hard)
 * - 悬浮效果：上移+阴影增强 (hover:translate-y-[-2px] hover:shadow-hard-hover)
 * 
 * @example
 * <BauhausCard>
 *   <BauhausCardHeader>
 *     <BauhausCardTitle>标题</BauhausCardTitle>
 *   </BauhausCardHeader>
 *   <BauhausCardContent>内容</BauhausCardContent>
 * </BauhausCard>
 */

// 主卡片组件
const BauhausCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "accent" | "info" | "destructive"
    hover?: boolean
  }
>(({ className, variant = "default", hover = true, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // 基础几何
      "rounded-none border-2",
      // 背景色
      variant === "default" && "bg-surface-card border-border-default",
      variant === "accent" && "bg-accent-brand border-border-default",
      variant === "info" && "bg-accent-info border-accent-info",
      variant === "destructive" && "bg-accent-destructive border-accent-destructive",
      // 硬阴影
      "shadow-hard",
      // 悬浮效果
      hover && [
        "transition-all duration-200 ease-out",
        "hover:translate-x-[-2px] hover:translate-y-[-2px]",
        "hover:shadow-hard-hover",
      ],
      // 文本颜色
      (variant === "info" || variant === "destructive") && "text-content-inverted",
      variant === "accent" && "text-content-primary",
      className
    )}
    {...props}
  />
))
BauhausCard.displayName = "BauhausCard"

// 卡片头部
const BauhausCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col space-y-1.5 p-5 border-b-2 border-border-default",
      className
    )}
    {...props}
  />
))
BauhausCardHeader.displayName = "BauhausCardHeader"

// 卡片标题
const BauhausCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-bold leading-none tracking-tight uppercase",
      className
    )}
    {...props}
  />
))
BauhausCardTitle.displayName = "BauhausCardTitle"

// 卡片描述
const BauhausCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-content-secondary", className)}
    {...props}
  />
))
BauhausCardDescription.displayName = "BauhausCardDescription"

// 卡片内容
const BauhausCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5", className)} {...props} />
))
BauhausCardContent.displayName = "BauhausCardContent"

// 卡片底部
const BauhausCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center p-5 border-t-2 border-border-default",
      className
    )}
    {...props}
  />
))
BauhausCardFooter.displayName = "BauhausCardFooter"

export {
  BauhausCard,
  BauhausCardHeader,
  BauhausCardFooter,
  BauhausCardTitle,
  BauhausCardDescription,
  BauhausCardContent,
}
