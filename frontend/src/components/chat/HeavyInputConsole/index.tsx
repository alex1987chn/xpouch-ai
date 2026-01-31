/**
 * 重型输入控制台
 * Industrial Terminal 风格的输入区域
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
    <div className="bg-card border-t-2 border-border z-20 p-0">
      {/* 输入流标签条 */}
      <div className="bg-[var(--accent)] h-1 w-full relative">
        <div className="absolute right-0 top-[-20px] bg-[var(--accent)] text-primary font-mono text-[9px] px-2 py-0.5 font-bold border-t-2 border-l-2 border-border">
          INPUT_STREAM
        </div>
      </div>

      {/* 输入区域 */}
      <div className="p-6 pb-6 pt-4 bg-page">
        <div className={cn(
          "bg-card border-2 border-border shadow-hard relative group transition-all",
          !disabled && "focus-within:shadow-[6px_6px_0_0_#facc15]"
        )}>
          {/* 行号 + 文本域 */}
          <div className="flex min-h-[100px]">
            <div className="w-10 py-4 text-right pr-3 font-mono text-xs text-primary/50 dark:text-primary/40 bg-page border-r-2 border-border/20 select-none leading-relaxed">
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
          <div className="flex justify-between items-center p-2 border-t-2 border-border bg-page">
            {/* 左侧：工具按钮 */}
            <div className="flex items-center gap-4 pl-2">
              <button
                disabled={disabled}
                className="text-primary hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                title="附件"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                disabled={disabled}
                className="text-primary hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                title="网络搜索"
              >
                <Globe className="w-4 h-4" />
              </button>
            </div>

            {/* 右侧：EXECUTE 按钮 / 停止按钮 */}
            {disabled && onStop ? (
              <button
                onClick={onStop}
                className="px-6 py-1.5 bg-[var(--logo-item-active)] text-inverted font-bold text-[10px] uppercase border-2 border-border transition-all flex items-center gap-2 shadow-sm hover:bg-[var(--accent)] hover:text-primary hover:border-border active:translate-y-[1px]"
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
                  "px-6 py-1.5 bg-primary text-inverted font-bold text-[10px] uppercase border-2 border-transparent transition-all flex items-center gap-2 shadow-sm",
                  value.trim() && "hover:bg-[var(--accent)] hover:text-primary hover:border-border active:translate-y-[1px]"
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
