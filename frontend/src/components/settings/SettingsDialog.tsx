import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Save, Info, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useModelsQuery } from '@/hooks/queries/useModelsQuery'
import { useUserSettingsQuery, useUpdateUserSettings } from '@/hooks/queries/useUserSettingsQuery'
import type { ThinkingMode } from '@/services/models'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

const THINKING_OPTIONS: { value: ThinkingMode; labelKey: 'thinkingAuto' | 'thinkingOn' | 'thinkingOff' }[] = [
  { value: 'auto', labelKey: 'thinkingAuto' },
  { value: 'enabled', labelKey: 'thinkingOn' },
  { value: 'disabled', labelKey: 'thinkingOff' },
]

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { t } = useTranslation()
  const { data: models = [], isLoading: modelsLoading, isError: modelsFailed } = useModelsQuery(isOpen)
  const { data: settingsData } = useUserSettingsQuery(isOpen)
  const saveMutation = useUpdateUserSettings()

  // '' 表示跟随系统默认模型
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [thinking, setThinking] = useState<ThinkingMode>('auto')

  // 服务端偏好加载后回填本地编辑态（每次打开对话框重新回填）
  useEffect(() => {
    if (isOpen && settingsData) {
      setSelectedModelId(settingsData.preferences.simple_model || '')
      setThinking(settingsData.preferences.simple_thinking || 'auto')
    }
  }, [isOpen, settingsData])

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
      { onSuccess: () => onClose() }
    )
  }

  const handleClose = () => {
    if (isSaving) return
    onClose()
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="relative bg-surface-card border-2 border-border-default shadow-theme-modal w-[600px] max-w-[90vw] max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - Bauhaus风格 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-hover"></div>
            <span className="text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {t('modelConfig')}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center border-2 border-border-default hover:bg-accent-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto bauhaus-scrollbar px-5 py-5 space-y-6">
          {/* Simple 模式：模型选择 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
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

            {!modelsLoading && !modelsFailed && (
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
                    <div className="text-[10px] text-content-secondary mt-0.5">
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
                      <div className="text-[10px] text-content-secondary mt-0.5">
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
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
            <p className="text-[9px] text-content-secondary opacity-60 mt-2">
              {supportsThinking ? t('thinkingCostHint') : t('thinkingUnsupported')}
            </p>
          </section>

          {/* 分隔线 */}
          <div className="border-t-2 border-border-default"></div>

          {/* Complex 模式说明 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('complexMode')}
              </span>
            </div>

            <div className="p-3 border-2 border-border-default">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-content-secondary flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-content-secondary">
                  {t('complexModeDesc')}
                </p>
              </div>
            </div>
          </section>

          {/* API Key 配置说明 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('apiKeyConfig')}
              </span>
            </div>

            <div className="p-3 border-2 border-border-default bg-status-info/10">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-status-info flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-content-primary mb-1">
                    {t('apiKeyConfigTitle')}
                  </h4>
                  <p className="text-[10px] text-content-secondary mb-1">
                    {t('apiKeyConfigDesc')}
                  </p>
                  <p className="text-[9px] text-content-secondary opacity-60">
                    {t('apiKeyConfigHint')}
                  </p>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* 底部按钮 */}
        <div className="flex gap-0 border-t-2 border-border-default shrink-0">
          <button
            onClick={handleClose}
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
      </div>
    </div>,
    document.body
  )
}
