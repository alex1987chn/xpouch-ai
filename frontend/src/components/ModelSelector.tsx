import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { models } from '@/config/models'

interface ModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
  label?: string
}

export default function ModelSelector({ value, onChange, label = 'MODEL_CONFIG' }: ModelSelectorProps) {
  // 查找当前模型对应的 provider
  const currentModel = models.find(m => m.id === value)
  const initialProvider = currentModel?.provider || 'deepseek'

  const [selectedProvider, setSelectedProvider] = useState<string>(initialProvider)
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  const providerDropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  // 获取唯一供应商列表
  const providers = Array.from(new Set(models.map(m => m.provider)))

  // 获取当前供应商的模型列表
  const currentProviderModels = models.filter(m => m.provider === selectedProvider)

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node

      // 检查点击是否在下拉菜单容器内
      const isClickInsideProvider = providerDropdownRef.current?.contains(target)
      const isClickInsideModel = modelDropdownRef.current?.contains(target)

      // 检查点击是否在 Portal 渲染的下拉菜单内
      const providerDropdown = document.querySelector('[data-provider-dropdown]')
      const modelDropdown = document.querySelector('[data-model-dropdown]')
      const isClickInProviderDropdown = providerDropdown?.contains(target)
      const isClickInModelDropdown = modelDropdown?.contains(target)

      if (!isClickInsideProvider && !isClickInProviderDropdown) {
        setShowProviderDropdown(false)
      }
      if (!isClickInsideModel && !isClickInModelDropdown) {
        setShowModelDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 当外部 value 变化时同步 provider
  useEffect(() => {
    const model = models.find(m => m.id === value)
    if (model && model.provider !== selectedProvider) {
      setSelectedProvider(model.provider)
    }
  }, [value, selectedProvider])

  const handleProviderSelect = (provider: string) => {
    setSelectedProvider(provider)
    // 自动选择该 provider 的第一个模型
    const firstModel = models.find(m => m.provider === provider)
    if (firstModel) {
      onChange(firstModel.id)
    }
    setShowProviderDropdown(false)
  }

  const handleModelSelect = (modelId: string) => {
    onChange(modelId)
    setShowModelDropdown(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
        <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
          {label}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 供应商选择 */}
        <div className="relative" ref={providerDropdownRef}>
          <label className="font-mono text-[9px] text-[var(--text-secondary)] mb-1 block uppercase">
            Provider
          </label>
          <button
            type="button"
            onClick={() => setShowProviderDropdown(!showProviderDropdown)}
            className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-xs text-left flex items-center justify-between hover:border-[var(--accent-hover)] transition-colors"
          >
            <span className="uppercase">{selectedProvider}</span>
            <span className="text-[var(--text-secondary)]">▼</span>
          </button>
          {showProviderDropdown && createPortal(
            <div
              data-provider-dropdown
              className="fixed border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] z-[9999] max-h-40 overflow-y-auto bauhaus-scrollbar"
              style={{
                width: providerDropdownRef.current?.getBoundingClientRect().width || 200,
                left: providerDropdownRef.current?.getBoundingClientRect().left || 0,
                top: (providerDropdownRef.current?.getBoundingClientRect().bottom || 0) + 4
              }}
            >
              {providers.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => handleProviderSelect(provider)}
                  className={cn(
                    'w-full px-3 py-2 text-left font-mono text-xs uppercase hover:bg-[var(--accent-hover)]/10 transition-colors pointer-events-auto',
                    selectedProvider === provider && 'bg-[var(--accent-hover)]/20'
                  )}
                >
                  {provider}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>

        {/* 模型选择 */}
        <div className="relative" ref={modelDropdownRef}>
          <label className="font-mono text-[9px] text-[var(--text-secondary)] mb-1 block uppercase">
            Model
          </label>
          <button
            type="button"
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-xs text-left flex items-center justify-between hover:border-[var(--accent-hover)] transition-colors"
          >
            <span>{models.find(m => m.id === value)?.name || 'Select'}</span>
            <span className="text-[var(--text-secondary)]">▼</span>
          </button>
          {showModelDropdown && createPortal(
            <div
              data-model-dropdown
              className="fixed border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] z-[9999] max-h-40 overflow-y-auto bauhaus-scrollbar"
              style={{
                width: modelDropdownRef.current?.getBoundingClientRect().width || 200,
                left: modelDropdownRef.current?.getBoundingClientRect().left || 0,
                top: (modelDropdownRef.current?.getBoundingClientRect().bottom || 0) + 4
              }}
            >
              {currentProviderModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleModelSelect(model.id)}
                  className={cn(
                    'w-full px-3 py-2 text-left font-mono text-xs hover:bg-[var(--accent-hover)]/10 transition-colors pointer-events-auto',
                    value === model.id && 'bg-[var(--accent-hover)]/20'
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  )
}
