import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * BauhausInput - 包豪斯风格终端输入框
 * 
 * 复刻 xpouch_ultra_refined.html 中的终端输入框样式：
 * - 方角无圆角
 * - 带阴影背景
 * - 左侧行号装饰 (01, 02, 03...)
 * - Focus时阴影变黄色
 * 
 * @example
 * <BauhausInput placeholder="输入指令..." />
 * <BauhausTextarea rows={4} />
 */

export interface BauhausInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  showLineNumbers?: boolean
  lineCount?: number
}

const BauhausInput = React.forwardRef<HTMLInputElement, BauhausInputProps>(
  ({ className, label, showLineNumbers = false, lineCount = 3, ...props }, ref) => {
    return (
      <div className="relative group">
        {/* 背景阴影层 */}
        <div 
          className={cn(
            "absolute inset-0 bg-[var(--shadow-color)]",
            "translate-x-2 translate-y-2",
            "group-focus-within:translate-x-3 group-focus-within:translate-y-3",
            "group-focus-within:bg-[var(--accent-hover)]",
            "transition-all duration-200"
          )}
        />
        
        {/* 主输入区域 */}
        <div className="relative border-2 border-[var(--border-color)] bg-[var(--bg-card)] flex">
          {/* 行号装饰 */}
          {showLineNumbers && (
            <div className="flex-none w-12 py-4 pl-4 border-r-2 border-[var(--border-color)] bg-[var(--bg-page)]">
              <div className="font-mono text-sm text-[var(--text-secondary)] opacity-30 select-none leading-relaxed">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i}>{String(i + 1).padStart(2, '0')}</div>
                ))}
              </div>
            </div>
          )}
          
          {/* 输入框 */}
          <div className="flex-1 relative">
            {label && (
              <div className="absolute -top-3 left-4 bg-[var(--bg-page)] px-2 font-mono text-xs font-bold border-2 border-[var(--border-color)] z-20 text-[var(--text-secondary)]">
                {label}
              </div>
            )}
            
            <input
              ref={ref}
              className={cn(
                "w-full h-14 bg-transparent",
                "px-4 py-3",
                "text-lg font-bold",
                "text-[var(--text-primary)]",
                "placeholder:text-[var(--text-secondary)]",
                "focus:outline-none focus:ring-0",
                "border-none",
                showLineNumbers && "pl-6",
                className
              )}
              {...props}
            />
          </div>
        </div>
      </div>
    )
  }
)
BauhausInput.displayName = "BauhausInput"

/**
 * BauhausTextarea - 包豪斯风格终端文本域
 * 
 * 复刻 HTML 中的 textarea 样式：
 * - 带行号装饰
 * - 阴影背景
 * - Focus时阴影变黄
 */
export interface BauhausTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  lineCount?: number
}

const BauhausTextarea = React.forwardRef<HTMLTextAreaElement, BauhausTextareaProps>(
  ({ className, label, lineCount = 3, ...props }, ref) => {
    return (
      <div className="relative group">
        {/* 背景阴影层 */}
        <div 
          className={cn(
            "absolute inset-0 bg-[var(--shadow-color)]",
            "translate-x-2 translate-y-2",
            "group-focus-within:translate-x-3 group-focus-within:translate-y-3",
            "group-focus-within:bg-[var(--accent-hover)]",
            "transition-all duration-200"
          )}
        />
        
        {/* 主输入区域 */}
        <div className="relative border-2 border-[var(--border-color)] bg-[var(--bg-card)] flex flex-col">
          {/* 输入区域 */}
          <div className="flex-1 relative flex">
            {/* 行号装饰 */}
            <div className="flex-none w-12 py-6 pl-4 border-r-2 border-[var(--border-color)]">
              <div className="font-mono text-sm text-[var(--text-secondary)] opacity-30 select-none leading-relaxed">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i}>{String(i + 1).padStart(2, '0')}</div>
                ))}
              </div>
            </div>
            
            {/* 文本域 */}
            <textarea
              ref={ref}
              className={cn(
                "flex-1 w-full min-h-[128px] bg-transparent",
                "py-6 pl-6 pr-6",
                "text-xl font-bold font-mono",
                "text-[var(--text-primary)]",
                "placeholder:text-[var(--text-secondary)]",
                "focus:outline-none focus:ring-0",
                "border-none resize-none",
                "z-10 relative",
                className
              )}
              {...props}
            />
          </div>
          
          {/* 底部工具栏 */}
          <div className="flex justify-between items-center p-3 border-t-2 border-[var(--border-color)] bg-[var(--bg-page)]">
            <div className="flex gap-2">
              <button className="p-2 border-2 border-transparent hover:bg-[var(--bg-card)] hover:border-[var(--border-color)] transition-all">
                <svg className="w-4 h-4 stroke-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              <button className="p-2 border-2 border-transparent hover:bg-[var(--bg-card)] hover:border-[var(--border-color)] transition-all">
                <svg className="w-4 h-4 stroke-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                ENTER TO SEND
              </span>
              <button className="bauhaus-btn px-6 py-2 flex items-center gap-2 bg-[var(--text-primary)] text-[var(--bg-card)] border-[var(--text-primary)] shadow-none hover:bg-[var(--accent-hover)] hover:text-black hover:border-black hover:shadow-[4px_4px_0_0_black]">
                <span>EXECUTE</span>
                <svg className="w-4 h-4 stroke-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
)
BauhausTextarea.displayName = "BauhausTextarea"

/**
 * BauhausLabel - 包豪斯风格标签
 */
const BauhausLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "font-mono text-xs font-bold uppercase tracking-wider",
      "text-[var(--text-secondary)]",
      className
    )}
    {...props}
  />
))
BauhausLabel.displayName = "BauhausLabel"

export { BauhausInput, BauhausTextarea, BauhausLabel }
