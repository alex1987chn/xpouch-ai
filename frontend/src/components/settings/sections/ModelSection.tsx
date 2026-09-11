/**
 * 模型偏好分区（系统管理页内嵌版本）。
 * 全局默认模型属实例级配置：模型选择器 + 思考开关 + 保存，
 * 无弹窗底栏（保存内联，取消不需要——切分区即回滚草稿）。
 */

import { useState, useEffect } from 'react'
import { Save, Info, Check } from 'lucide-react'
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
    <div className="space-y-6">
      {/* 默认模型（管理员可选，普通用户只读） */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 bg-content-secondary"></div>
          <span className="text-micro font-bold tracking-widest text-content-secondary">
            {t('simpleMode')}
          </span>
        </div>

        {modelsLoading && (
          <div className="p-3 text-xs text-content-secondary">{t('modelsLoading')}</div>
        )}
        {modelsFailed && (
          <div className="p-3 border-theme-card border-border-default text-xs text-content-secondary">
            {t('modelsLoadFailed')}
          </div>
        )}

        {!modelsLoading && !modelsFailed && (
          <div className="space-y-2">
            {/* 跟随系统默认 */}
            <div
              onClick={() => setSelectedModelId('')}
              className={cn(
                'flex items-center gap-3 p-3 border-theme-card cursor-pointer transition-all',
                selectedModelId === ''
                  ? 'border-accent-hover bg-accent-hover/10'
                  : 'border-border-default hover:border-content-secondary'
              )}
            >
              <div className="flex-1">
                <div className="text-sm font-bold text-content-primary">
                  {t('followSystemDefault')}
                </div>
                <div className="text-micro text-content-secondary mt-0.5">
                  {settingsData?.default_model?.name || effectiveModelId}
                </div>
              </div>
              {selectedModelId === '' && (
                <div className="w-5 h-5 border-2 border-border-default bg-accent-hover flex items-center justify-center">
                  <Check className="w-3 h-3 text-content-primary" />
                </div>
              )}
            </div>

            {/* 可选模型 */}
            {models.map(model => (
              <div
                key={model.id}
                onClick={() => setSelectedModelId(model.id)}
                className={cn(
                  'flex items-center gap-3 p-3 border-theme-card cursor-pointer transition-all',
                  selectedModelId === model.id
                    ? 'border-accent-hover bg-accent-hover/10'
                    : 'border-border-default hover:border-content-secondary'
                )}
              >
                <div className="flex-1">
                  <div className="text-sm font-bold text-content-primary">
                    {model.name}
                  </div>
                  <div className="text-micro text-content-secondary mt-0.5">
                    {model.provider_name} - {Math.round(model.context_window / 1000)}K tokens
                    {model.thinking_toggle ? ` - ${t('thinkingMode')}` : ''}
                  </div>
                </div>
                {selectedModelId === model.id && (
                  <div className="w-5 h-5 border-2 border-border-default bg-accent-hover flex items-center justify-center">
                    <Check className="w-3 h-3 text-content-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 思考模式开关 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 bg-content-secondary"></div>
          <span className="text-micro font-bold tracking-widest text-content-secondary">
            {t('thinkingMode')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-0 border-theme-card border-border-default">
          {THINKING_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              disabled={!supportsThinking}
              onClick={() => setThinking(option.value)}
              className={cn(
                'py-2.5 text-xs font-bold transition-colors',
                option.value !== 'auto' && 'border-l border-border-divider',
                !supportsThinking && 'opacity-40 cursor-not-allowed',
                supportsThinking && thinking === option.value
                  ? 'bg-accent-hover text-content-primary'
                  : 'text-content-secondary hover:bg-surface-page'
              )}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
        <p className="text-nano text-content-secondary opacity-60 mt-2">
          {supportsThinking ? t('thinkingCostHint') : t('thinkingUnsupported')}
        </p>
      </section>

      {/* Complex 模式：一行提示（模型由管理员在专家管理配置） */}
      <p className="text-nano text-content-secondary opacity-60 flex items-start gap-1.5">
        <Info className="w-3 h-3 shrink-0 mt-0.5" />
        <span>{t('complexModeDesc')}</span>
      </p>

      {/* 保存（内联右对齐） */}
      <div className="flex justify-end pt-1">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center gap-2 px-4 py-2 border-theme-button border-border-default bg-accent-hover text-accent-ink text-xs font-bold hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? t('savingUserSettings') : t('save')}
        </button>
      </div>
    </div>
  )
}
