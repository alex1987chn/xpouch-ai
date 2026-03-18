/**
 * 重型输入控制台
 * Industrial Terminal 风格的输入区域
 * 
 * 语义化改造：使用 theme-* 类名替代硬编码样式
 */

import { cn } from '@/lib/utils'
import { Terminal, Paperclip, Globe, Square } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { HeavyInputConsoleProps } from '../types'
import HeavyInputTextArea from './HeavyInputTextArea'

export default function HeavyInputConsole({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
}: HeavyInputConsoleProps) {
  const { t } = useTranslation()

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSend()
      }
    }
  }

  return (
    <div className="bg-card border-t-2 border-border-default z-20 p-0">
      {/* 输入区域 */}
      <div className="p-4 pb-4 pt-3 bg-page">
        <div className={cn(
          "bg-card border-2 border-border-default shadow-theme-card relative group transition-all rounded-md",
          !disabled && "focus-within:shadow-theme-card-accent"
        )}>
          {/* 行号 + 文本域 */}
          <div className="flex min-h-[100px]">
            <div className="w-10 py-4 text-right pr-3 font-mono text-xs text-content-primary/50 bg-page border-r-2 border-border-default/20 select-none leading-relaxed">
              01<br/>02<br/>03
            </div>
            <HeavyInputTextArea
              value={value}
              onChange={onChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
            />
          </div>

          {/* 工具栏 */}
          <div className="flex justify-between items-center p-2 border-t-2 border-border-default bg-page">
            {/* 左侧：工具按钮 */}
            <div className="flex items-center gap-4 pl-2">
              <button
                disabled={disabled}
                className="text-content-primary hover:text-accent-brand transition-colors disabled:opacity-50"
                title={t('attachment')}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                disabled={disabled}
                className="text-content-primary hover:text-accent-brand transition-colors disabled:opacity-50"
                title={t('webSearch')}
              >
                <Globe className="w-4 h-4" />
              </button>
            </div>

            {/* 右侧：EXECUTE 按钮 / 停止按钮 */}
            {disabled && onStop ? (
              <button
                onClick={onStop}
                className="px-6 py-1.5 bg-accent-destructive text-content-inverted font-bold text-[10px] uppercase border-2 border-accent-destructive transition-all flex items-center gap-2 shadow-theme-button hover:shadow-theme-button-hover hover:bg-accent-destructive/90 active:[transform:var(--transform-button-active)] rounded-md"
                title={t('stop')}
              >
                <Square className="w-3 h-3" />
                {t('stop')}
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!value.trim()}
                className={cn(
                  "px-6 py-1.5 bg-surface-elevated text-content-primary font-bold text-[10px] uppercase border-2 border-border-default transition-all flex items-center gap-2 shadow-theme-button rounded-md",
                  value.trim() && "hover:bg-accent-brand hover:text-content-inverted hover:border-accent-brand hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)]"
                )}
              >
                {t('execute')}
                <Terminal className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
