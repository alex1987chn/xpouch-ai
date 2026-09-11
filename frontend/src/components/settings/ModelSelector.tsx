/**
 * ModelSelector - 模型选择器
 *
 * [设计] 分组行卡单选（与设置中心 ModelSection 同语法）：
 * 按 provider 分组小标题 + 模型行卡（名称 + 元信息 + 圆形 radio）。
 * 替代原双下拉（provider/model 两个 portal 菜单）。
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

  // 按 provider 分组（保持后端顺序）
  const groups = useMemo(() => {
    const map = new Map<string, typeof models>()
    for (const m of models) {
      const list = map.get(m.provider) ?? []
      list.push(m)
      map.set(m.provider, list)
    }
    return Array.from(map.entries())
  }, [models])

  return (
    <div className="space-y-2.5">
      {label && (
        <label className="block text-xs font-bold text-content-secondary">
          {label}
        </label>
      )}

      {groups.map(([provider, providerModels]) => (
        <div key={provider}>
          <div className="mb-1.5 px-1 text-[11px] font-bold text-content-muted">
            {provider}
          </div>
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
      ))}
    </div>
  )
}
