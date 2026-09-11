/**
 * 模型偏好分区（系统管理页内嵌版本）。
 * 全局默认模型属实例级配置：思考开关置顶 + 模型单选行 + 保存，
 * 无弹窗底栏（保存内联，取消不需要——切分区即回滚草稿）。
 * 布局对齐 docs/design 蓝本 model-row / radio / primary-btn 语法。
 */

import { useState, useEffect } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useModelsQuery } from '@/hooks/queries/useModelsQuery'
import { useUserSettingsQuery, useUpdateUserSettings } from '@/hooks/queries/useUserSettingsQuery'
import type { ThinkingMode } from '@/services/models'

const THINKING_OPTIONS: { value: ThinkingMode; labelKey: 'thinkingAuto' | 'thinkingOn' | 'thinkingOff' }[] = [
  { value: 'auto', labelKey: 'thinkingAuto' },
  { value: 'enabled', labelKey: 'thinkingOn' },
  { value: 'disabled', labelKey: 'thinkingOff' },
]

export function ModelSection() {
  const { t } = useTranslation()
  const { data: models = [], isLoading: modelsLoading, isError: modelsFailed } = useModelsQuery(true)
  const { data: settingsData } = useUserSettingsQuery(true)
  const saveMutation = useUpdateUserSettings()

  // '' 表示跟随系统默认模型
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [thinking, setThinking] = useState<ThinkingMode>('auto')

  // 服务端偏好加载后回填本地编辑态（分区挂载时重新回填）
  useEffect(() => {
    if (settingsData) {
      setSelectedModelId(settingsData.preferences.simple_model || '')
      setThinking(settingsData.preferences.simple_thinking || 'auto')
    }
  }, [settingsData])

  // 当前生效模型（用户选择或系统默认）的思考开关能力
  const effectiveModelId = selectedModelId || settingsData?.default_model?.id || ''
  const effectiveModel = models.find(m => m.id === effectiveModelId)
  const supportsThinking = !!effectiveModel?.thinking_toggle

  const isSaving = saveMutation.isPending
  const canSave = !modelsLoading && !modelsFailed && !isSaving

  const handleSave = () => {
    saveMutation.mutate(
      {
        simple_model: selectedModelId || null,
        // 不支持开关的模型一律存 auto（后端也会忽略无效覆盖）
        simple_thinking: supportsThinking ? thinking : 'auto',
      },
      {
        onSuccess: () => {
          setSelectedModelId(settingsData?.preferences.simple_model || '')
        },
      }
    )
  }

  return (
    <div className="space-y-5">
      {/* 思考开关（置顶，蓝本「思考 · 自动」胶囊语法） */}
      <section>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-content-secondary">{t('thinkingMode')}</span>
          <div className="flex h-[30px] items-center overflow-hidden rounded-full border-theme-card border-border-default bg-surface-card">
            {THINKING_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                disabled={!supportsThinking}
                onClick={() => setThinking(option.value)}
                className={cn(
                  'h-full px-3.5 text-xs transition-colors',
                  index > 0 && 'border-l border-border-divider',
                  !supportsThinking && 'cursor-not-allowed opacity-40',
                  supportsThinking && thinking === option.value
                    ? 'bg-surface-tint font-bold text-content-primary'
                    : 'text-content-muted hover:text-content-primary'
                )}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed text-content-muted">
          {supportsThinking ? t('thinkingCostHint') : t('thinkingUnsupported')}
        </p>
      </section>

      {/* 模型单选（蓝本 model-row / radio 语法） */}
      <section>
        <span className="mb-2.5 block text-xs font-bold text-content-secondary">{t('simpleMode')}</span>

        {modelsLoading && (
          <div className="rounded-md p-3 text-xs text-content-secondary">{t('modelsLoading')}</div>
        )}
        {modelsFailed && (
          <div className="rounded-md border border-border-default p-3 text-xs text-content-secondary">
            {t('modelsLoadFailed')}
          </div>
        )}

        {!modelsLoading && !modelsFailed && (
          <div className="space-y-2.5">
            {/* 跟随系统默认 */}
            <button
              type="button"
              onClick={() => setSelectedModelId('')}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border p-3.5 text-left transition-all',
                selectedModelId === ''
                  ? 'border-border-default bg-surface-card shadow-theme-card'
                  : 'border-border-divider bg-surface-card hover:border-border-hover'
              )}
            >
              <div className="flex-1">
                <div className="text-[13px] font-bold text-content-primary">
                  {t('followSystemDefault')}
                </div>
                <div className="mt-0.5 text-[11.5px] text-content-muted">
                  {settingsData?.default_model?.name || effectiveModelId}
                </div>
              </div>
              <span
                className={cn(
                  'h-4 w-4 shrink-0 rounded-full border-2 transition-all',
                  selectedModelId === '' ? 'border-accent-brand bg-accent-brand' : 'border-border-hover'
                )}
              />
            </button>

            {/* 可选模型 */}
            {models.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelectedModelId(model.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border p-3.5 text-left transition-all',
                  selectedModelId === model.id
                    ? 'border-border-default bg-surface-card shadow-theme-card'
                    : 'border-border-divider bg-surface-card hover:border-border-hover'
                )}
              >
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-content-primary">
                    {model.name}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-content-muted">
                    {model.provider_name} · {Math.round(model.context_window / 1000)}K tokens
                    {model.thinking_toggle ? ` · ${t('thinkingMode')} ✓` : ''}
                  </div>
                </div>
                <span
                  className={cn(
                    'h-4 w-4 shrink-0 rounded-full border-2 transition-all',
                    selectedModelId === model.id ? 'border-accent-brand bg-accent-brand' : 'border-border-hover'
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Complex 模式：一行提示（模型由管理员在专家管理配置） */}
      <p className="flex items-start gap-1.5 text-[11.5px] text-content-muted">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{t('complexModeDesc')}</span>
      </p>

      {/* 保存（内联右对齐，蓝本 primary-btn 胶囊） */}
      <div className="flex justify-end pt-1">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center gap-2 rounded-full border border-border-divider bg-accent-brand px-5 py-2 text-[13px] font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {isSaving ? t('savingUserSettings') : t('save')}
        </button>
      </div>
    </div>
  )
}
