/**
 * ExpertFormDialog - 专家表单对话框
 * 
 * [职责]
 * 新建/编辑专家的弹窗表单
 * - 处理 expert_key 格式验证
 * - 模型选择、温度滑块
 * - System Prompt 编辑
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import ModelSelector from '@/components/settings/ModelSelector'
import type { SystemExpert, CreateExpertRequest, UpdateExpertRequest } from '@/services/admin'

interface ExpertFormDialogProps {
  mode: 'create' | 'edit'
  isOpen: boolean
  expert?: SystemExpert | null
  isSubmitting: boolean
  onSubmit: (data: CreateExpertRequest | UpdateExpertRequest) => void
  onClose: () => void
}

export default function ExpertFormDialog({
  mode,
  isOpen,
  expert,
  isSubmitting,
  onSubmit,
  onClose,
}: ExpertFormDialogProps) {
  const { t } = useTranslation()
  const [keyError, setKeyError] = useState('')

  // 表单数据
  const [formData, setFormData] = useState<CreateExpertRequest & { id?: number }>({
    expert_key: '',
    name: '',
    description: '',
    system_prompt: '',
    model: 'gpt-4o',
    temperature: 0.5,
  })

  // 编辑模式下初始化表单数据
  useEffect(() => {
    if (mode === 'edit' && expert) {
      setFormData({
        id: expert.id,
        expert_key: expert.expert_key,
        name: expert.name,
        description: expert.description || '',
        system_prompt: expert.system_prompt,
        model: expert.model,
        temperature: expert.temperature,
      })
    } else if (mode === 'create') {
      setFormData({
        expert_key: '',
        name: '',
        description: '',
        system_prompt: '',
        model: 'gpt-4o',
        temperature: 0.5,
      })
    }
    setKeyError('')
  }, [mode, expert, isOpen])

  // 验证 expert_key 格式
  const validateExpertKey = (key: string): boolean => {
    const regex = /^[a-z][a-z0-9_]*$/
    return regex.test(key)
  }

  const handleExpertKeyChange = (value: string) => {
    setFormData((prev) => ({ ...prev, expert_key: value }))
    if (value && !validateExpertKey(value)) {
      setKeyError(t('expertKeyHint'))
    } else {
      setKeyError('')
    }
  }

  const handleSubmit = () => {
    if (!formData.expert_key || !formData.name || !formData.system_prompt) {
      return
    }
    if (!validateExpertKey(formData.expert_key)) {
      setKeyError(t('expertKeyHint'))
      return
    }
    onSubmit(formData)
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
    }
  }

  if (!isOpen) return null

  const isCreate = mode === 'create'
  const title = isCreate ? (t as any)('createExpert') : (t as any)('editExpert')

  return createPortal(
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-content-primary/50 z-50" onClick={handleClose} />
      {/* 对话框容器 */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg border-2 border-border-default bg-surface-card shadow-hard z-50 max-h-[90vh] overflow-y-auto">
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[rgb(var(--accent-hover))]" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {title}
            </span>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-7 h-7 flex items-center justify-center border border-border-default hover:bg-[rgb(var(--accent-hover))] transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-4 space-y-4">
          {/* Expert Key - 仅创建时可编辑 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('expertKey')}
              </label>
            </div>
            <input
              type="text"
              value={formData.expert_key}
              onChange={(e) => handleExpertKeyChange(e.target.value)}
              placeholder={t('expertKeyPlaceholder')}
              disabled={isSubmitting || !isCreate}
              className={cn(
                'w-full px-3 py-2 border-2 bg-surface-page font-mono text-sm focus:outline-none transition-colors',
                keyError
                  ? 'border-status-offline focus:border-status-offline'
                  : 'border-border-default focus:border-[rgb(var(--accent-hover))]',
                !isCreate && 'opacity-60 cursor-not-allowed'
              )}
            />
            {keyError && (
              <p className="font-mono text-[9px] text-status-offline">{keyError}</p>
            )}
            <p className="font-mono text-[9px] text-content-secondary">
              {t('expertKeyHint')}
            </p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {'Name'}
              </label>
            </div>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={t('namePlaceholder')}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-[rgb(var(--accent-hover))] transition-colors"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('expertDescription')}
              </label>
            </div>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder={t('expertDescriptionPlaceholder')}
              rows={2}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-[rgb(var(--accent-hover))] transition-colors resize-y min-h-[60px]"
            />
          </div>

          {/* Model */}
          <ModelSelector
            value={formData.model}
            onChange={(modelId) =>
              setFormData((prev) => ({ ...prev, model: modelId }))
            }
            label={t('modelConfig')}
          />

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('temperature')}: {formData.temperature.toFixed(1)}
              </label>
            </div>
            <div className="relative h-8 bg-surface-page border-2 border-border-default">
              <div
                className="absolute top-0 left-0 h-full bg-[rgb(var(--accent-hover))] transition-all pointer-events-none"
                style={{ width: `${(formData.temperature / 2) * 100}%` }}
              />
              <div
                className="absolute top-0 w-4 h-full bg-[rgb(var(--content-primary))] border-2 border-border-default transition-all pointer-events-none"
                style={{
                  left: `calc(${(formData.temperature / 2) * 100}% - 8px)`,
                }}
              />
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={formData.temperature}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    temperature: parseFloat(e.target.value),
                  }))
                }
                disabled={isSubmitting}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
              />
            </div>
            <div className="flex justify-between font-mono text-[9px] text-content-secondary">
              <span>0.0 ({t('conservative')})</span>
              <span>1.0 ({t('balanced')})</span>
              <span>2.0 ({t('creative')})</span>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('systemPrompt')}
              </label>
            </div>
            <textarea
              value={formData.system_prompt}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  system_prompt: e.target.value,
                }))
              }
              placeholder={t('systemPromptPlaceholder')}
              rows={5}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-[rgb(var(--accent-hover))] transition-colors resize-y min-h-[100px]"
            />
            <div className="flex justify-between font-mono text-[9px] text-content-secondary">
              <span>{formData.system_prompt.length} {t('chars')}</span>
              <span
                className={formData.system_prompt.length < 10 ? 'text-status-offline' : ''}
              >
                {t('minChars')}: 10
              </span>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t-2 border-border-default">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 border-2 border-border-default bg-surface-page font-mono text-xs font-bold uppercase hover:bg-[rgb(var(--accent-hover))] hover:text-content-primary transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !formData.expert_key ||
              !formData.name ||
              !formData.system_prompt ||
              formData.system_prompt.length < 10 ||
              !!keyError
            }
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-2 border-border-default',
              'bg-[rgb(var(--accent-hover))] text-content-primary font-mono text-xs font-bold uppercase',
              'shadow-hard-sm',
              'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard-3',
              'active:translate-x-[0px] active:translate-y-[0px] active:shadow-none',
              'transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0'
            )}
          >
            {isSubmitting ? (
              <>
                <div className="w-3 h-3 border-2 border-content-primary/30 border-t-content-primary animate-spin" />
                {isCreate ? t('creating') : t('saving')}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {isCreate ? t('create') : t('save')}
              </>
            )}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
