import { cn } from "@/lib/utils"

/**
 * SystemStatusMarquee - 系统状态跑马灯
 * 
 * 复刻 xpouch_ultra_refined.html 中的跑马灯：
 * - 无缝循环滚动
 * - 等宽字体
 * - 大写字母
 * - 滚动速度：20s linear infinite
 * 
 * @example
 * <SystemStatusMarquee />
 * <SystemStatusMarquee speed={15} className="text-xs" />
 * <SystemStatusMarquee items={["CUSTOM", "TEXT", "HERE"]} />
 */

interface SystemStatusMarqueeProps {
  /** 滚动速度（秒） */
  speed?: number
  /** 自定义内容 */
  items?: string[]
  /** 附加类名 */
  className?: string
}

export function SystemStatusMarquee({
  speed = 20,
  items,
  className,
}: SystemStatusMarqueeProps) {
  // 默认系统状态文本
  const defaultItems = [
    "SYSTEM STATUS: ONLINE",
    "CONNECTED TO NEURAL NET",
    "WAITING FOR INSTRUCTION",
    "XPOUCH OS V2.4",
  ]

  const displayItems = items || defaultItems
  
  // 创建重复的内容以实现无缝循环
  const content = displayItems.join(" /// ")
  const repeatedContent = `${content} /// ${content} /// `

  return (
    <div
      className={cn(
        "w-full overflow-hidden whitespace-nowrap",
        "border-b-2 border-[var(--border-color)]",
        "bg-[var(--bg-card)] py-1",
        className
      )}
    >
      <div
        className="inline-block font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]"
        style={{
          animation: `marquee ${speed}s linear infinite`,
        }}
      >
        {repeatedContent}
      </div>
    </div>
  )
}

/**
 * MarqueeContainer - 通用跑马灯容器
 * 
 * 可用于任何内容的跑马灯效果
 */
interface MarqueeContainerProps {
  children: React.ReactNode
  speed?: number
  pauseOnHover?: boolean
  className?: string
}

export function MarqueeContainer({
  children,
  speed = 20,
  pauseOnHover = false,
  className,
}: MarqueeContainerProps) {
  return (
    <div
      className={cn(
        "overflow-hidden whitespace-nowrap",
        className
      )}
    >
      <div
        className={cn(
          "inline-flex",
          pauseOnHover && "hover:[animation-play-state:paused]"
        )}
        style={{
          animation: `marquee ${speed}s linear infinite`,
        }}
      >
        {/* 复制两份内容以实现无缝循环 */}
        <div className="flex items-center">{children}</div>
        <div className="flex items-center">{children}</div>
      </div>
    </div>
  )
}

/**
 * BlinkingCursor - 闪烁光标
 * 
 * 用于输入框等位置的光标指示器
 */
interface BlinkingCursorProps {
  className?: string
}

export function BlinkingCursor({ className }: BlinkingCursorProps) {
  return (
    <span
      className={cn(
        "inline-block w-2.5 h-6 align-middle",
        "bg-[var(--accent-hover)]",
        "animate-[blink_1s_step-end_infinite]",
        className
      )}
    />
  )
}
