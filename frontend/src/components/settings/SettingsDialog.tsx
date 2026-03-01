import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Save, Info, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AVAILABLE_MODELS, getDefaultModel, setDefaultModel } from '@/utils/config'
import { useTranslation } from '@/i18n'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { t } = useTranslation()
  const [selectedModelId, setSelectedModelId] = useState<string>(getDefaultModel())

  // 加载默认模型
  useEffect(() => {
    if (isOpen) {
      setSelectedModelId(getDefaultModel())
    }
  }, [isOpen])

  const handleSave = () => {
    setDefaultModel(selectedModelId)
    onClose()
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="relative bg-surface-card border-2 border-border-default shadow-hard w-[600px] max-w-[90vw] max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - Bauhaus风格 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-hover"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {t('systemConfig')}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center border border-border-default hover:bg-accent-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto bauhaus-scrollbar px-5 py-5 space-y-6">
          {/* 默认模型选择 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('defaultModel')}
              </span>
            </div>

            <div className="space-y-2">
              {AVAILABLE_MODELS.map(model => (
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
                    <div className="font-mono text-sm font-bold text-content-primary">
                      {model.name}
                    </div>
                    <div className="font-mono text-[10px] text-content-secondary mt-0.5">
                      {model.description}
                    </div>
                  </div>
                  {selectedModelId === model.id && (
                    <div className="w-5 h-5 border-2 border-accent-hover bg-accent-hover flex items-center justify-center">
                      <Check className="w-3 h-3 text-content-primary" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 分隔线 */}
          <div className="border-t-2 border-border-default"></div>

          {/* API Key 配置说明 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-content-secondary"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('apiKeyConfig')}
              </span>
            </div>

            <div className="p-3 border-2 border-status-info/50 bg-status-info/10">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-status-info flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-mono text-xs font-bold text-content-primary mb-1">
                    {t('apiKeyConfigTitle')}
                  </h4>
                  <p className="font-mono text-[10px] text-content-secondary mb-1">
                    {t('apiKeyConfigDesc')}
                  </p>
                  <p className="font-mono text-[9px] text-content-secondary opacity-60">
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
            className="flex-1 py-3 font-mono text-sm font-bold uppercase border-r-2 border-border-default hover:bg-surface-page transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-accent-hover text-content-primary font-mono text-sm font-bold uppercase hover:brightness-95 transition-colors"
          >
            <span className="flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              保存设置
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
