import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Image, Paperclip, X, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface UploadedFile {
  id: string
  name: string
  type: 'image' | 'file'
  url?: string
  size?: number
}

interface GlowingInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onSubmitComplete?: () => void
  placeholder?: string
  disabled?: boolean
  isTyping?: boolean
  onFocusRestore?: () => void
}

export default function GlowingInput({
  value,
  onChange,
  onSubmit,
  onSubmitComplete,
  placeholder = '输入消息...',
  disabled = false,
  isTyping = false,
  onFocusRestore
}: GlowingInputProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }, [onChange])

  const wasTyping = useRef(false)

  const handleSubmit = useCallback(() => {
    if (value.trim() || files.length > 0) {
      wasTyping.current = isTyping
      onSubmit()
      // 提交后自动 focus 输入框
      setTimeout(() => {
        textareaRef.current?.focus()
        onSubmitComplete?.()
      }, 0)
    }
  }, [value, files, onSubmit, onSubmitComplete, isTyping])

  // 当 isTyping 变为 false 时，恢复 focus
  useEffect(() => {
    if (!isTyping && wasTyping.current) {
      wasTyping.current = false
      setTimeout(() => {
        textareaRef.current?.focus()
        onFocusRestore?.()
      }, 100)
    }
  }, [isTyping, onFocusRestore])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    
    const newFiles: UploadedFile[] = selectedFiles.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      name: file.name,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      size: file.size
    }))

    setFiles(prev => [...prev, ...newFiles])
    
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id)
      if (file?.url) {
        URL.revokeObjectURL(file.url)
      }
      return prev.filter(f => f.id !== id)
    })
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const canSubmit = value.trim() || files.length > 0

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* 光晕层 - 使用 CSS 类 (移动端基础效果，桌面端增强) */}
      <div className={cn('input-glow', isFocused && 'active')} />

      {/* 输入框主体 */}
      <div
        className={cn(
          'relative rounded-[28px] transition-all duration-300 overflow-hidden',
          isFocused 
            ? 'border-2 border-indigo-500 dark:border-indigo-400 pulse-glow' 
            : 'shadow-lg border-2 border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-slate-950',
          'dark:shadow-[inset_0_2px_20px_rgba(139,92,246,0.05)]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* 文件预览区域 */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-muted/50 border-b border-border">
            {files.map(file => (
              <div
                key={file.id}
                className="group relative flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border shadow-sm"
              >
                {file.type === 'image' ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-vibe-glow-purple/20 dark:bg-vibe-glow-purple/10 flex items-center justify-center shrink-0">
                    <File className="w-4 h-4" style={{ color: '#6366F1' }} />
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-sm text-gray-700 dark:text-gray-200 truncate max-w-[100px]">
                    {file.name}
                  </span>
                  {file.size && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-600 dark:bg-gray-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 输入区域容器 */}
        <div
          className="flex flex-col min-h-[100px] cursor-text"
          onClick={() => textareaRef.current?.focus()}
        >
          {/* 文本输入框 */}
          <div className="flex-1 px-4 py-3 min-h-0">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              disabled={disabled}
              rows={3}
              className="w-full min-h-[60px] resize-none bg-transparent border-0 outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 text-base leading-relaxed"
            />
          </div>

          {/* 底部工具栏 */}
          <div className="flex items-center justify-between px-3 py-2">
            {/* 左侧工具按钮 */}
            <div className="flex items-center gap-1">
              <input
                type="file"
                ref={imageInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                multiple
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => imageInputRef.current?.click()}
                disabled={disabled}
                className="w-8 h-8 rounded-lg text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                title="上传图片"
              >
                <Image className="w-4 h-4" />
              </Button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="*/*"
                multiple
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="w-8 h-8 rounded-lg text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                title="上传附件"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
            </div>

            {/* 发送按钮 */}
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || disabled || isTyping}
              size="sm"
              className={cn(
                'h-9 px-5 rounded-xl transition-all font-medium shadow-sm',
                canSubmit
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
              )}
            >
              <Send className="w-4 h-4 mr-1.5" />
              发送
            </Button>
          </div>
        </div>

        {/* 快捷提示 */}
        {files.length === 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/50 border-t border-border transition-colors duration-300">
            按 Enter 发送，Shift + Enter 换行
          </div>
        )}
      </div>
    </div>
  )
}
