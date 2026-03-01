/**
 * Bauhaus 风格 Select 组件
 * 
 * 与项目设计系统一致：直角、硬边、无圆角
 * 支持复用于分类选择、模型选择等场景
 */

import { useState, useRef, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
}

interface BauhausSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
}

export function BauhausSelect({ 
  value, 
  onChange, 
  options, 
  placeholder = 'Select...',
  className 
}: BauhausSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectedOption = options.find(opt => opt.value === value)

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm text-left flex items-center justify-between hover:border-accent-hover transition-colors"
      >
        <span>{selectedOption?.label || placeholder}</span>
        <span className="text-content-secondary">▼</span>
      </button>

      {isOpen && createPortal(
        <div
          className="fixed border-2 border-border-default bg-surface-card shadow-hard z-[9999] max-h-60 overflow-y-auto bauhaus-scrollbar"
          style={{
            width: triggerRef.current?.getBoundingClientRect().width || 200,
            left: triggerRef.current?.getBoundingClientRect().left || 0,
            top: (triggerRef.current?.getBoundingClientRect().bottom || 0) + 4
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={cn(
                'w-full px-3 py-2.5 text-left font-mono text-sm transition-all',
                'hover:bg-accent-hover hover:text-content-primary',
                value === option.value
                  ? 'bg-accent-hover text-content-primary font-bold'
                  : 'bg-transparent text-content-primary'
              )}
            >
              <span className="flex items-center gap-2">
                {value === option.value && (
                  <span className="w-1.5 h-1.5 bg-content-primary rounded-full" />
                )}
                {option.label}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default BauhausSelect
