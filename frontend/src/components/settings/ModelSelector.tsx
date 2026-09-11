/**
 * ModelSelector - 模型选择器（渠道 + 模型 两级）
 *
 * [设计] 渠道（provider）分段胶囊一行选中，下方为该渠道的模型行卡
 * （名称 + tokens/思考元信息 + 黄色 radio）。切渠道自动选中该渠道
 * 首个模型；外部 value 变化时自动回显其所属渠道。
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useModelsQuery } from '@/hooks/queries/useModelsQuery'
import { useTranslation } from '@/i18n'

interface ModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
  label?: string
  disabled?: boolean
}

export default function ModelSelector({ value, onChange, label, disabled }: ModelSelectorProps) {
  const { t } = useTranslation()
  // 模型列表来自后端 GET /api/models（单一真相源）
  const { data: models = [] } = useModelsQuery()

  const providers = useMemo(
    () => Array.from(new Set(models.map(m => m.provider))),
    [models]
  )

  // 当前 value 所属渠道（无匹配时回落第一个渠道）
  const activeProvider =
    models.find(m => m.id === value)?.provider ?? providers[0] ?? ''
  const providerModels = models.filter(m => m.provider === activeProvider)

  const handleProviderSwitch = (provider: string) => {
    if (provider === activeProvider) return
    const first = models.find(m => m.provider === provider)
    if (first) onChange(first.id)
  }

  return (
    <div className="space-y-2.5">
      {label && (
        <label className="block text-xs font-bold text-content-secondary">
          {label}
        </label>
      )}

      {/* 渠道：分段胶囊 */}
      {providers.length > 1 && (
        <div className="flex h-[30px] w-fit items-center overflow-hidden rounded-full border border-border-default bg-surface-page">
          {providers.map((provider, i) => (
            <button
              key={provider}
              type="button"
              disabled={disabled}
              onClick={() => handleProviderSwitch(provider)}
              className={cn(
                'h-full px-3.5 text-xs transition-colors',
                i > 0 && 'border-l border-border-divider',
                provider === activeProvider
                  ? 'bg-surface-tint font-bold text-content-primary'
                  : 'text-content-muted hover:text-content-primary'
              )}
            >
              {provider}
            </button>
          ))}
        </div>
      )}

      {/* 该渠道的模型：行卡单选 */}
      <div className="space-y-1.5">
        {providerModels.map(model => (
          <button
            key={model.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(model.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-all',
              value === model.id
                ? 'border-border-default bg-surface-card shadow-theme-card'
                : 'border-border-divider bg-surface-card hover:border-border-hover',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-content-primary">
                {model.name}
              </div>
              <div className="truncate text-[11px] text-content-muted">
                {Math.round(model.context_window / 1000)}K tokens
                {model.thinking_toggle ? ` · ${t('thinkingMode')} ✓` : ''}
              </div>
            </div>
            <span
              className={cn(
                'h-4 w-4 shrink-0 rounded-full border-2 transition-all',
                value === model.id ? 'border-accent-brand bg-accent-brand' : 'border-border-hover'
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
