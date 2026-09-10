/**
 * 模型偏好分区（设置中心）。
 * v3.4.7 起为实例级配置：管理员（ADMIN）选择全局默认模型与
 * 思考模式，普通用户只读（与「可见但锁」体系一致的轻量锁定态）。
 * API Key 说明卡已移除（部署文档归专家管理/README，不属于用户设置）。
 */

import { useState, useEffect } from 'react'
import { Save, Info, Check, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useUserStore } from '@/store/userStore'
import { useModelsQuery } from '@/hooks/queries/useModelsQuery'
import { useUserSettingsQuery, useUpdateUserSettings } from '@/hooks/queries/useUserSettingsQuery'
import type { ThinkingMode } from '@/services/models'

interface ModelSectionProps {
  /** 关闭回调：设置中心内使用；管理控制台内嵌时缺省（取消=回滚草稿） */
  onClose?: () => void
}

const THINKING_OPTIONS: { value: ThinkingMode; labelKey: 'thinkingAuto' | 'thinkingOn' | 'thinkingOff' }[] = [
  { value: 'auto', labelKey: 'thinkingAuto' },
  { value: 'enabled', labelKey: 'thinkingOn' },
  { value: 'disabled', labelKey: 'thinkingOff' },
]

export function ModelSection({ onClose }: ModelSectionProps) {
  const { t } = useTranslation()
  const { user } = useUserStore()
  // 全局默认模型仅管理员可写（后端 PUT 有角色守卫，前端按角色渲染）
  const canEdit = user?.role === 'admin'

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
  const canSave = canEdit && !modelsLoading && !modelsFailed && !isSaving

  const handleSave = () => {
    saveMutation.mutate(
      {
        simple_model: selectedModelId || null,
        // 不支持开关的模型一律存 auto（后端也会忽略无效覆盖）
        simple_thinking: supportsThinking ? thinking : 'auto',
      },
      { onSuccess: () => onClose?.() }
    )
  }

  const handleCancel = () => {
    setSelectedModelId(settingsData?.preferences.simple_model || '')
    setThinking(settingsData?.preferences.simple_thinking || 'auto')
    onClose?.()
  }

  const thinkingLabelKey =
    thinking === 'enabled' ? 'thinkingOn' : thinking === 'disabled' ? 'thinkingOff' : 'thinkingAuto'

  return (
    <>
      <div className="flex-1 overflow-y-auto bauhaus-scrollbar px-5 py-5 space-y-6">
        {/* 默认模型（管理员可选，普通用户只读） */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 bg-content-secondary"></div>
            <span className="text-micro font-bold uppercase tracking-widest text-content-secondary">
              {t('simpleMode')}
            </span>
          </div>

          {modelsLoading && (
            <div className="p-3 text-xs text-content-secondary">{t('modelsLoading')}</div>
          )}
          {modelsFailed && (
            <div className="p-3 border-2 border-border-default text-xs text-content-secondary">
              {t('modelsLoadFailed')}
            </div>
          )}

          {!modelsLoading && !modelsFailed && !canEdit && (
            <div className="p-3 border-2 border-border-default bg-surface-page">
              <div className="flex items-center justify-between gap-3">
                <span className="text-micro text-content-secondary uppercase shrink-0">
                  {t('defaultModel')}
                </span>
                <span className="text-sm font-bold text-content-primary truncate">
                  {effectiveModel?.name || t('followSystemDefault')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t-2 border-border-default">
                <span className="text-micro text-content-secondary uppercase shrink-0">
                  {t('thinkingMode')}
                </span>
                <span className="text-sm font-bold text-content-primary">
                  {t(thinkingLabelKey)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2.5 text-micro text-content-secondary opacity-70">
                <Lock className="w-3 h-3 shrink-0" />
                <span>{t('modelManagedByAdmin')}</span>
              </div>
            </div>
          )}

          {!modelsLoading && !modelsFailed && canEdit && (
            <div className="space-y-2">
              {/* 跟随系统默认 */}
              <div
                onClick={() => setSelectedModelId('')}
                className={cn(
                  'flex items-center gap-3 p-3 border-2 cursor-pointer transition-all',
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
                    'flex items-center gap-3 p-3 border-2 cursor-pointer transition-all',
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

        {/* 思考模式开关（管理员可调，普通用户已在摘要卡中展示） */}
        {canEdit && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="text-micro font-bold uppercase tracking-widest text-content-secondary">
                {t('thinkingMode')}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-0 border-2 border-border-default">
              {THINKING_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!supportsThinking}
                  onClick={() => setThinking(option.value)}
                  className={cn(
                    'py-2.5 text-xs font-bold uppercase transition-colors',
                    option.value !== 'auto' && 'border-l-2 border-border-default',
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
        )}

        {/* Complex 模式：一行提示（模型由管理员在专家管理配置） */}
        <p className="text-nano text-content-secondary opacity-60 flex items-start gap-1.5">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{t('complexModeDesc')}</span>
        </p>
      </div>

      {/* 底部按钮（仅管理员可保存） */}
      {canEdit && (
        <div className="flex gap-0 border-t-2 border-border-default shrink-0">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 py-3 text-sm font-bold uppercase border-r-2 border-border-default hover:bg-surface-page transition-colors disabled:opacity-40"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 py-3 bg-accent-hover text-content-primary text-sm font-bold uppercase hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? t('savingUserSettings') : t('save')}
            </span>
          </button>
        </div>
      )}
    </>
  )
}
