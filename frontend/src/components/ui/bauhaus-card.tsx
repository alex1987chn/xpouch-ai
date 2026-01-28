import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * BauhausCard - 包豪斯风格卡片
 * 
 * 设计特点：
 * - 直角无圆角 (rounded-none)
 * - 实线粗边框 (border-2)
 * - 纯实色背景 (bg-bauhaus-card)
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
    variant?: "default" | "yellow" | "blue" | "red"
    hover?: boolean
  }
>(({ className, variant = "default", hover = true, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // 基础几何
      "rounded-none border-2",
      // 背景色
      variant === "default" && "bg-bauhaus-card border-bauhaus-border",
      variant === "yellow" && "bg-bauhaus-yellow border-bauhaus-border",
      variant === "blue" && "bg-bauhaus-blue border-bauhaus-blue",
      variant === "red" && "bg-bauhaus-red border-bauhaus-red",
      // 硬阴影
      "shadow-hard",
      // 悬浮效果
      hover && [
        "transition-all duration-200 ease-out",
        "hover:translate-x-[-2px] hover:translate-y-[-2px]",
        "hover:shadow-hard-hover",
      ],
      // 文本颜色
      (variant === "blue" || variant === "red") && "text-white",
      variant === "yellow" && "text-bauhaus-border",
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
      "flex flex-col space-y-1.5 p-5 border-b-2 border-bauhaus-border",
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
    className={cn("text-sm text-bauhaus-muted", className)}
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
      "flex items-center p-5 border-t-2 border-bauhaus-border",
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
