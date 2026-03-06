/**
 * ============================================
 * ThemeCard - 主题感知卡片组件（最佳实践示例）
 * ============================================
 * 
 * 这个组件展示如何正确实现主题感知：
 * 1. 使用 CSS 变量控制主题相关样式
 * 2. 使用 Tailwind className 控制布局
 * 3. 无需 !important，无需覆盖
 */

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * ThemeCard 属性接口
 */
interface ThemeCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 悬停时是否有上浮效果 */
  hoverable?: boolean
  /** 是否可点击 */
  clickable?: boolean
}

/**
 * 主题感知卡片组件
 * 
 * @example
 * // 基础用法
 * <ThemeCard>内容</ThemeCard>
 * 
 * @example
 * // 可悬停
 * <ThemeCard hoverable>悬停有上浮效果</ThemeCard>
 * 
 * @example
 * // 可点击
 * <ThemeCard clickable onClick={handleClick}>点击卡片</ThemeCard>
 */
const ThemeCard = React.forwardRef<HTMLDivElement, ThemeCardProps>(
  ({ className, hoverable = false, clickable = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // 基础布局样式（与主题无关）
          "bg-surface-card text-content-primary",
          "transition-all duration-200",
          
          // 交互状态
          hoverable && "cursor-pointer",
          clickable && "cursor-pointer",
          
          className
        )}
        style={{
          // 主题相关样式使用 CSS 变量
          // 这样不同主题只需修改变量，不需要覆盖类
          borderWidth: 'var(--border-width-card)',
          borderStyle: 'solid',
          borderColor: 'rgb(var(--border-default))',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-card)',
          // 悬停效果也使用变量
          ...(hoverable && {
            transition: 'all 0.2s ease',
          }),
        }}
        {...(hoverable && {
          onMouseEnter: (e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'
            e.currentTarget.style.transform = 'var(--transform-card-hover)'
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-card)'
            e.currentTarget.style.transform = 'none'
          },
        })}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ThemeCard.displayName = "ThemeCard"

export { ThemeCard }
export type { ThemeCardProps }
