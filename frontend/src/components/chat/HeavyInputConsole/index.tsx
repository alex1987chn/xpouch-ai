/**
 * 重型输入控制台
 * 蓝本 .input-console：单行圆角卡——[附件][联网] [输入区...] [圆形发送钮]，
 * 输入随内容自增高（field-sizing-content），按钮始终贴底对齐。
 */

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { Paperclip, Globe, Square, X, ArrowUp } from 'lucide-react'
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
    <div className="z-20 shrink-0 bg-surface-page px-6 pb-4 pt-1">
      <div className="mx-auto w-full max-w-[760px]">
        {/* 输入台卡片（单行结构，蓝本 .input-console） */}
        <div className={cn(
          "relative rounded-lg border border-border-divider bg-surface-card shadow-theme-card transition-shadow",
          !disabled && "focus-within:shadow-theme-card-accent"
        )}>
          {/* 已选图片缩略图（带移除，置于输入行上方） */}
          {imageList.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-2.5">
              {imageList.map((img, index) => (
                <div key={`${index}-${img.slice(-12)}`} className="relative">
                  <img
                    src={img}
                    alt={`image-${index + 1}`}
                    className="h-14 w-14 rounded-md border border-border-divider object-cover"
                  />
                  <button
                    onClick={() => onRemoveImage?.(index)}
                    aria-label={t('close')}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-content-primary text-surface-card transition-colors hover:bg-status-offline"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 单行：附件 + 联网 + 输入区 + 发送 */}
          <div className="flex items-end gap-2 px-2.5 py-2">
            <button
              disabled={disabled || imageList.length >= MAX_IMAGES}
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('attachment')}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-border-divider bg-surface-card text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50"
              title={`${t('attachment')}${imageList.length ? ` (${imageList.length}/${MAX_IMAGES})` : ''}`}
            >
              <Paperclip className="h-[15px] w-[15px]" />
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
              title={t('webSearch')}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-border-divider bg-surface-card text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50"
            >
              <Globe className="h-[15px] w-[15px]" />
            </button>

            <HeavyInputTextArea
              value={value}
              onChange={onChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
            />

            {/* 圆形发送 / 停止（蓝本 .send / .stop-btn） */}
            {disabled && onStop ? (
              <button
                onClick={onStop}
                aria-label={t('stop')}
                title={t('stop')}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border-hover bg-surface-card text-content-primary transition-colors hover:bg-surface-tint"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!hasContent}
                aria-label={t('send')}
                title={t('send')}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border-divider bg-accent-brand text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card-accent active:translate-y-0 active:shadow-none disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
