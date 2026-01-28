import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * BauhausCard - 包豪斯风格卡片
 * 
 * 复刻 xpouch_ultra_refined.html 中的 .bauhaus-card 样式：
 * - border: 2px solid var(--border-color)
 * - background: var(--bg-card)
 * - box-shadow: var(--shadow-color) 6px 6px 0 0
 * - transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)
 * - hover: translate(-3px, -3px) + 阴影变黄 + 边框变黄
 * 
 * 特性：
 * - 支持右上角倒角装饰（cornerCut）
 * - 支持编号标签（number）
 * - 支持变体样式（default, dashed, active）
 * 
 * @example
 * <BauhausCard>内容</BauhausCard>
 * <BauhausCard number="01" cornerCut>带倒角的卡片</BauhausCard>
 * <BauhausCard variant="dashed">虚线边框</BauhausCard>
 */

export interface BauhausCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "dashed" | "active"
  number?: string
  cornerCut?: boolean
  hover?: boolean
  sideColor?: string
}

const BauhausCard = React.forwardRef<HTMLDivElement, BauhausCardProps>(
  ({ 
    className, 
    variant = "default", 
    number, 
    cornerCut = false, 
    hover = true,
    sideColor,
    children, 
    ...props 
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // 基础几何
          "relative overflow-hidden",
          "border-2",
          "transition-all",
          
          // 变体样式
          variant === "default" && [
            "border-[var(--border-color)] bg-[var(--bg-card)]",
            "shadow-[var(--shadow-color)_6px_6px_0_0]",
            "duration-200",
            // 弹性过渡
            "ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            // Hover效果
            hover && [
              "cursor-pointer",
              "hover:translate-x-[-3px] hover:translate-y-[-3px]",
              "hover:shadow-[var(--accent-hover)_10px_10px_0_0]",
              "hover:border-[var(--accent-hover)]",
            ],
          ],
          
          variant === "dashed" && [
            "border-dashed border-[var(--text-secondary)]",
            "bg-transparent",
            "hover:bg-[var(--bg-card)]",
            "hover:border-solid hover:border-[var(--accent-hover)]",
            "hover:shadow-[8px_8px_0_0_var(--accent-hover)]",
            "hover:translate-x-[-2px] hover:translate-y-[-2px]",
            "transition-all duration-200",
          ],
          
          variant === "active" && [
            "border-[var(--border-color)] bg-[var(--bg-card)]",
            "shadow-[var(--accent-hover)_8px_8px_0_0]",
          ],
          
          className
        )}
        {...props}
      >
        {/* 右上角编号 */}
        {number && (
          <div className="absolute top-0 right-0 p-2 font-mono text-[10px] font-bold opacity-30">
            {number}
          </div>
        )}
        
        {/* 右下角倒角装饰 */}
        {cornerCut && (
          <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[20px] border-r-[20px] border-b-[var(--accent-hover)] border-r-transparent transition-all group-hover:border-b-[40px] group-hover:border-r-[40px]" />
        )}
        
        {/* 左侧色条 */}
        {sideColor && (
          <div 
            className="absolute left-0 top-0 bottom-0 w-1 border-r-2 border-[var(--border-color)]"
            style={{ backgroundColor: sideColor }}
          />
        )}
        
        {children}
      </div>
    )
  }
)
BauhausCard.displayName = "BauhausCard"

/**
 * BauhausCardHeader - 卡片头部
 */
const BauhausCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col space-y-1.5 p-5",
      className
    )}
    {...props}
  />
))
BauhausCardHeader.displayName = "BauhausCardHeader"

/**
 * BauhausCardTitle - 卡片标题
 */
const BauhausCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-black text-lg tracking-tight leading-none",
      "group-hover:underline decoration-2 underline-offset-4",
      className
    )}
    {...props}
  />
))
BauhausCardTitle.displayName = "BauhausCardTitle"

/**
 * BauhausCardDescription - 卡片描述
 */
const BauhausCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-xs font-mono text-[var(--text-secondary)] leading-tight",
      className
    )}
    {...props}
  />
))
BauhausCardDescription.displayName = "BauhausCardDescription"

/**
 * BauhausCardContent - 卡片内容
 */
const BauhausCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5", className)} {...props} />
))
BauhausCardContent.displayName = "BauhausCardContent"

/**
 * BauhausCardFooter - 卡片底部
 */
const BauhausCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center p-5 border-t-2 border-[var(--border-color)]",
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
