/**
 * 重型输入控制台
 * Industrial Terminal 风格的输入区域
 * 
 * 语义化改造：使用 theme-* 类名替代硬编码样式
 */

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { Terminal, Paperclip, Globe, Square, X } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { HeavyInputConsoleProps } from '../types'
import HeavyInputTextArea from './HeavyInputTextArea'

const MAX_IMAGES = 4

export default function HeavyInputConsole({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  images,
  onImagesSelected,
  onRemoveImage,
}: HeavyInputConsoleProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageList = images ?? []
  const hasContent = Boolean(value.trim()) || imageList.length > 0

  // File → dataURL（控制台内完成转换，父层只存 dataURL 列表）
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !onImagesSelected) return
    const room = MAX_IMAGES - imageList.length
    if (room <= 0) return
    const picked = Array.from(files)
      .slice(0, room)
      .filter(f => f.type.startsWith('image/'))
    const dataUrls = await Promise.all(
      picked.map(
        file =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(file)
          })
      )
    )
    onImagesSelected([...imageList, ...dataUrls])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (hasContent && !disabled) {
        onSend()
      }
    }
  }

  return (
    <div className="bg-card border-t-2 border-border-default z-20 p-0">
      {/* 输入区域 */}
      <div className="p-4 pb-4 pt-3 bg-surface-page">
        <div className={cn(
          "bg-card border-2 border-border-default shadow-theme-card relative group transition-all rounded-md",
          !disabled && "focus-within:shadow-theme-card-accent"
        )}>
          {/* 行号 + 文本域 */}
          <div className="flex min-h-[100px]">
            <div className="w-10 py-4 text-right pr-3 font-mono text-xs text-content-primary/50 bg-surface-page border-r-2 border-border-default/20 select-none leading-relaxed">
              01<br/>02<br/>03
            </div>
            <HeavyInputTextArea
              value={value}
              onChange={onChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
            />
          </div>

          {/* 已选图片缩略图（带移除） */}
          {imageList.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3 bg-surface-page">
              {imageList.map((img, index) => (
                <div key={`${index}-${img.slice(-12)}`} className="relative">
                  <img
                    src={img}
                    alt={`image-${index + 1}`}
                    className="w-14 h-14 border-2 border-border-default object-cover"
                  />
                  <button
                    onClick={() => onRemoveImage?.(index)}
                    aria-label={t('close')}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-content-primary text-surface-card flex items-center justify-center hover:bg-status-offline transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 工具栏 */}
          <div className="flex justify-between items-center p-2 border-t-2 border-border-default bg-surface-page">
            {/* 左侧：工具按钮 */}
            <div className="flex items-center gap-4 pl-2">
              <button
                disabled={disabled || imageList.length >= MAX_IMAGES}
                onClick={() => fileInputRef.current?.click()}
                aria-label={t('attachment')}
                className="p-2 text-content-primary hover:text-accent-brand transition-colors disabled:opacity-50"
                title={`${t('attachment')}${imageList.length ? ` (${imageList.length}/${MAX_IMAGES})` : ''}`}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  void handleFiles(e.target.files)
                }}
              />
              <button
                disabled={disabled}
                aria-label={t('webSearch')}
                className="p-2 text-content-primary hover:text-accent-brand transition-colors disabled:opacity-50"
                title={t('webSearch')}
              >
                <Globe className="w-4 h-4" />
              </button>
            </div>

            {/* 右侧：EXECUTE 按钮 / 停止按钮 */}
            {disabled && onStop ? (
              <button
                onClick={onStop}
                className="px-6 py-1.5 bg-accent-destructive text-content-inverted font-bold text-micro uppercase border-2 border-accent-destructive transition-all flex items-center gap-2 shadow-theme-button hover:shadow-theme-button-hover hover:bg-accent-destructive/90 active:[transform:var(--transform-button-active)] rounded-md"
                title={t('stop')}
              >
                <Square className="w-3 h-3" />
                {t('stop')}
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!hasContent}
                className={cn(
                  "px-6 py-1.5 bg-surface-elevated text-content-primary font-bold text-micro uppercase border-2 border-border-default transition-all flex items-center gap-2 shadow-theme-button rounded-md",
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
