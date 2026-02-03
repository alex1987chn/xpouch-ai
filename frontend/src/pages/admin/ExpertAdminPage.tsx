import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Save, RefreshCw, Loader2, Play, Search, Check, X, Sparkles, Plus, Trash2 } from 'lucide-react'
import { models } from '@/config/models'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import ModelSelector from '@/components/settings/ModelSelector'
import {
  getAllExperts,
  getExpert,
  updateExpert,
  previewExpert,
  generateExpertDescription,
  createExpert,
  deleteExpert,
  type ExpertResponse,
  type ExpertUpdateRequest,
  type CreateExpertRequest,
  type GenerateDescriptionResponse,
} from '@/services/admin'
import { logger } from '@/utils/logger'

// Bauhaus Toast 组件（简单的替代方案）
function BauhausToast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 px-4 py-3 border-2 shadow-[var(--shadow-color)_4px_4px_0_0] font-mono text-xs font-bold uppercase",
      type === 'success'
        ? 'border-green-500 bg-green-50 text-green-700'
        : 'border-red-500 bg-red-50 text-red-700'
    )}>
      {message}
    </div>
  )
}

// 创建专家对话框
function CreateExpertDialog({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}: {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: CreateExpertRequest) => void
  isCreating: boolean
}) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<CreateExpertRequest>({
    expert_key: '',
    name: '',
    description: '',
    system_prompt: '',
    model: 'gpt-4o',
    temperature: 0.5,
  })
  const [keyError, setKeyError] = useState('')

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
    // 校验必填字段
    if (!formData.expert_key || !formData.name || !formData.system_prompt) {
      return
    }
    if (!validateExpertKey(formData.expert_key)) {
      setKeyError(t('expertKeyHint'))
      return
    }
    onCreate(formData)
  }

  const handleClose = () => {
    if (!isCreating) {
      setFormData({
        expert_key: '',
        name: '',
        description: '',
        system_prompt: '',
        model: 'gpt-4o',
        temperature: 0.5,
      })
      setKeyError('')
      onClose()
    }
  }

  if (!isOpen) return null

  return createPortal(
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={handleClose} />
      {/* 对话框容器 */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] z-50 max-h-[90vh] overflow-y-auto">
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent-hover)]" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              /// {t('createExpert')}
            </span>
          </div>
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="w-7 h-7 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-4 space-y-4">
          {/* Expert Key */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {t('expertKey')}
              </label>
            </div>
            <input
              type="text"
              value={formData.expert_key}
              onChange={(e) => handleExpertKeyChange(e.target.value)}
              placeholder={t('expertKeyPlaceholder')}
              disabled={isCreating}
              className={cn(
                "w-full px-3 py-2 border-2 bg-[var(--bg-page)] font-mono text-sm focus:outline-none transition-colors",
                keyError
                  ? "border-red-500 focus:border-red-500"
                  : "border-[var(--border-color)] focus:border-[var(--accent-hover)]"
              )}
            />
            {keyError && (
              <p className="font-mono text-[9px] text-red-500">{keyError}</p>
            )}
            <p className="font-mono text-[9px] text-[var(--text-secondary)]">{t('expertKeyHint')}</p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {t('name')}
              </label>
            </div>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('namePlaceholder')}
              disabled={isCreating}
              className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {t('expertDescription')}
              </label>
            </div>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t('expertDescriptionPlaceholder')}
              rows={2}
              disabled={isCreating}
              className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors resize-y min-h-[60px]"
            />
          </div>

          {/* Model */}
          <ModelSelector
            value={formData.model}
            onChange={(modelId) => setFormData((prev) => ({ ...prev, model: modelId }))}
            label={t('modelConfig')}
          />

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {t('temperature')}: {formData.temperature.toFixed(1)}
              </label>
            </div>
            <div className="relative h-8 bg-[var(--bg-page)] border-2 border-[var(--border-color)]">
              {/* 进度条背景 */}
              <div
                className="absolute top-0 left-0 h-full bg-[var(--accent-hover)] transition-all pointer-events-none"
                style={{ width: `${(formData.temperature / 2) * 100}%` }}
              />
              {/* 滑块手柄 */}
              <div
                className="absolute top-0 w-4 h-full bg-[var(--text-primary)] border-2 border-[var(--border-color)] transition-all pointer-events-none"
                style={{ left: `calc(${(formData.temperature / 2) * 100}% - 8px)` }}
              />
              {/* 实际的 range input */}
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                disabled={isCreating}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
              />
            </div>
            <div className="flex justify-between font-mono text-[9px] text-[var(--text-secondary)]">
              <span>0.0 ({t('conservative')})</span>
              <span>1.0 ({t('balanced')})</span>
              <span>2.0 ({t('creative')})</span>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]" />
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {t('systemPrompt')}
              </label>
            </div>
            <textarea
              value={formData.system_prompt}
              onChange={(e) => setFormData((prev) => ({ ...prev, system_prompt: e.target.value }))}
              placeholder={t('systemPromptPlaceholder')}
              rows={5}
              disabled={isCreating}
              className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors resize-y min-h-[100px]"
            />
            <div className="flex justify-between font-mono text-[9px] text-[var(--text-secondary)]">
              <span>{formData.system_prompt.length} {t('chars')}</span>
              <span className={formData.system_prompt.length < 10 ? 'text-red-500' : ''}>
                {t('minChars')}: 10
              </span>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t-2 border-[var(--border-color)]">
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="px-4 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-xs font-bold uppercase hover:bg-[var(--accent-hover)] hover:text-black transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              isCreating ||
              !formData.expert_key ||
              !formData.name ||
              !formData.system_prompt ||
              formData.system_prompt.length < 10 ||
              !!keyError
            }
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-2 border-[var(--border-color)]',
              'bg-[var(--accent-hover)] text-black font-mono text-xs font-bold uppercase',
              'shadow-[var(--shadow-color)_2px_2px_0_0]',
              'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0]',
              'active:translate-x-[0px] active:translate-y-[0px] active:shadow-none',
              'transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0'
            )}
          >
            {isCreating ? (
              <>
                <div className="w-3 h-3 border-2 border-black/30 border-t-black animate-spin" />
                {t('creating')}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {t('create')}
              </>
            )}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

// 删除确认对话框
function DeleteConfirmDialog({
  isOpen,
  expert,
  onClose,
  onConfirm,
  isDeleting,
}: {
  isOpen: boolean
  expert: ExpertResponse | null
  onClose: () => void
  onConfirm: () => void
  isDeleting: boolean
}) {
  const { t } = useTranslation()

  if (!isOpen || !expert) return null

  return createPortal(
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={!isDeleting ? onClose : undefined} />
      {/* 对话框容器 */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] z-50">
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              /// {t('confirmDeleteExpert')}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="w-7 h-7 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4">
          <p className="font-mono text-sm text-[var(--text-primary)]">
            {t('deleteExpertWarning').replace('{name}', expert.name)}
          </p>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t-2 border-[var(--border-color)]">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-xs font-bold uppercase hover:bg-[var(--accent-hover)] hover:text-black transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-2 border-red-500',
              'bg-red-500 text-white font-mono text-xs font-bold uppercase',
              'shadow-[rgba(239,68,68,0.3)_2px_2px_0_0]',
              'hover:bg-red-600 hover:border-red-600',
              'active:translate-x-[0px] active:translate-y-[0px] active:shadow-none',
              'transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isDeleting ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white animate-spin" />
                {t('deleting')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {t('delete')}
              </>
            )}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

export default function ExpertAdminPage() {
  const { t } = useTranslation()
  const [experts, setExperts] = useState<ExpertResponse[]>([])
  const [selectedExpert, setSelectedExpert] = useState<ExpertResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState<ExpertUpdateRequest>({
    system_prompt: '',
    description: '',
    model: 'gpt-4o',
    temperature: 0.5,
  })
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false)

  // Toast 状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // 预览相关状态
  const [previewMode, setPreviewMode] = useState(false)
  const [testInput, setTestInput] = useState('')
  const [previewResult, setPreviewResult] = useState<any>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  // 创建专家对话框状态
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // 删除确认对话框状态
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [expertToDelete, setExpertToDelete] = useState<ExpertResponse | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // 加载专家列表
  const loadExperts = async () => {
    setIsLoading(true)
    try {
      const data = await getAllExperts()
      setExperts(data)
      if (data.length > 0 && !selectedExpert) {
        await selectExpert(data[0].expert_key)
      }
    } catch (error) {
      logger.error('Failed to load experts:', error)
      setToast({ message: t('loadFailed'), type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  // 选择专家
  const selectExpert = async (expertKey: string) => {
    try {
      const data = await getExpert(expertKey)
      setSelectedExpert(data)
      setFormData({
        system_prompt: data.system_prompt,
        description: data.description || '',
        model: data.model,
        temperature: data.temperature,
      })

      setPreviewResult(null)
      setTestInput('')
      setPreviewMode(false)
    } catch (error) {
      logger.error('Failed to load expert:', error)
      setToast({ message: t('loadExpertFailed'), type: 'error' })
    }
  }

  // 保存配置
  const handleSave = async () => {
    if (!selectedExpert) return

    setIsSaving(true)
    try {
      await updateExpert(selectedExpert.expert_key, formData)
      await loadExperts()
      await selectExpert(selectedExpert.expert_key)
      setToast({ message: t('saveSuccess'), type: 'success' })
    } catch (error) {
      logger.error('Failed to update expert:', error)
      setToast({ message: t('saveFailed'), type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  // 预览专家响应
  const handlePreview = async () => {
    if (!selectedExpert || testInput.length < 10) {
      setToast({ message: t('testInputMinCharsError'), type: 'error' })
      return
    }

    setIsPreviewing(true)
    setPreviewResult(null)
    try {
      const result = await previewExpert({
        expert_key: selectedExpert.expert_key,
        test_input: testInput,
      })
      setPreviewResult(result)
      setToast({ message: `${t('executionCompleted')} (${(result.execution_time_ms / 1000).toFixed(2)}${t('secondsAbbr')})`, type: 'success' })
    } catch (error) {
      logger.error('Failed to preview expert:', error)
      setToast({ message: t('previewFailed'), type: 'error' })
    } finally {
      setIsPreviewing(false)
    }
  }

  // 刷新所有专家
  const handleRefresh = async () => {
    await loadExperts()
    setToast({ message: t('refreshSuccess'), type: 'success' })
  }

  // 自动生成描述
  const handleGenerateDescription = async () => {
    if (!formData.system_prompt || formData.system_prompt.length < 10) {
      setToast({ message: t('systemPromptTooShort'), type: 'error' })
      return
    }

    setIsGeneratingDescription(true)
    try {
      const result: GenerateDescriptionResponse = await generateExpertDescription({
        system_prompt: formData.system_prompt,
      })
      setFormData((prev) => ({ ...prev, description: result.description }))
      setToast({ message: t('descriptionGenerated'), type: 'success' })
    } catch (error) {
      logger.error('Failed to generate description:', error)
      setToast({ message: t('generateDescriptionFailed'), type: 'error' })
    } finally {
      setIsGeneratingDescription(false)
    }
  }

  // 表单字段更新
  const handleFieldChange = (
    field: keyof ExpertUpdateRequest,
    value: string | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // 打开创建专家对话框
  const handleOpenCreateDialog = () => {
    setIsCreateDialogOpen(true)
  }

  // 创建专家
  const handleCreateExpert = async (data: CreateExpertRequest) => {
    setIsCreating(true)
    try {
      await createExpert(data)
      setToast({ message: t('createSuccess'), type: 'success' })
      setIsCreateDialogOpen(false)
      await loadExperts()
      // 选中新创建的专家
      await selectExpert(data.expert_key)
    } catch (error) {
      logger.error('Failed to create expert:', error)
      setToast({ message: t('createFailed'), type: 'error' })
    } finally {
      setIsCreating(false)
    }
  }

  // 打开删除确认对话框
  const handleOpenDeleteDialog = (expert: ExpertResponse, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!expert.is_dynamic) {
      setToast({ message: t('cannotDeleteSystemExpert'), type: 'error' })
      return
    }
    setExpertToDelete(expert)
    setIsDeleteDialogOpen(true)
  }

  // 删除专家
  const handleDeleteExpert = async () => {
    if (!expertToDelete) return

    setIsDeleting(true)
    try {
      await deleteExpert(expertToDelete.expert_key)
      setToast({ message: t('deleteSuccess'), type: 'success' })
      setIsDeleteDialogOpen(false)
      setExpertToDelete(null)
      // 如果删除的是当前选中的专家，清空选择
      if (selectedExpert?.expert_key === expertToDelete.expert_key) {
        setSelectedExpert(null)
      }
      await loadExperts()
    } catch (error) {
      logger.error('Failed to delete expert:', error)
      setToast({ message: t('deleteFailed'), type: 'error' })
    } finally {
      setIsDeleting(false)
    }
  }

  // 过滤专家列表
  const filteredExperts = experts.filter(expert =>
    expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expert.expert_key.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    loadExperts()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[var(--border-color)] border-t-[var(--accent-hover)] animate-spin"></div>
        <span className="ml-3 font-mono text-sm text-[var(--text-secondary)]">{t('loading')}</span>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-[100dvh] p-4 bg-[var(--bg-page)]">
      {/* Toast */}
      {toast && (
        <BauhausToast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* 创建专家对话框 */}
      <CreateExpertDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreateExpert}
        isCreating={isCreating}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        expert={expertToDelete}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteExpert}
        isDeleting={isDeleting}
      />

      {/* 左侧：专家列表 */}
      <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              /// {t('expertsHeader')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 新建专家按钮 */}
            <button
              onClick={handleOpenCreateDialog}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase border border-[var(--border-color)] bg-[var(--bg-page)] hover:bg-[var(--accent-hover)] hover:text-black hover:border-[var(--accent-hover)] transition-colors"
              title={t('newExpert')}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('newExpert')}</span>
            </button>
            <button
              onClick={handleRefresh}
              className="w-7 h-7 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-hover)] transition-colors"
              title={t('refresh')}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="p-3 border-b-2 border-[var(--border-color)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-xs focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
            />
          </div>
        </div>

        {/* 专家列表 */}
        <div className="flex-1 overflow-y-auto bauhaus-scrollbar p-2">
          <div className="space-y-1">
            {filteredExperts.map((expert) => (
              <button
                key={expert.id}
                onClick={() => selectExpert(expert.expert_key)}
                className={cn(
                  'w-full text-left px-3 py-3 border-2 transition-all relative group',
                  selectedExpert?.expert_key === expert.expert_key
                    ? 'border-[var(--accent-hover)] bg-[var(--accent-hover)] text-black shadow-[var(--shadow-color)_2px_2px_0_0]'
                    : 'border-transparent hover:border-[var(--border-color)] hover:bg-[var(--bg-page)]'
                )}
              >
                {/* 选中指示器 */}
                {selectedExpert?.expert_key === expert.expert_key && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-black" />
                )}
                
                {/* 删除按钮（仅对动态专家显示） */}
                {expert.is_dynamic && (
                  <div
                    onClick={(e) => handleOpenDeleteDialog(expert, e)}
                    className={cn(
                      'absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded transition-colors opacity-0 group-hover:opacity-100',
                      selectedExpert?.expert_key === expert.expert_key
                        ? 'hover:bg-black/20 text-black/70 hover:text-black'
                        : 'hover:bg-red-100 text-[var(--text-secondary)] hover:text-red-500'
                    )}
                    title={t('deleteExpert')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className={cn(
                  "font-mono text-sm font-bold",
                  selectedExpert?.expert_key === expert.expert_key ? 'text-black' : 'text-[var(--text-primary)]',
                  expert.is_dynamic && 'pr-6'
                )}>
                  {expert.name}
                </div>
                <div className={cn(
                  "font-mono text-[9px] mt-1 uppercase",
                  selectedExpert?.expert_key === expert.expert_key ? 'text-black/70' : 'text-[var(--text-secondary)]'
                )}>
                  {expert.expert_key}
                </div>
              </button>
            ))}
          </div>
          {filteredExperts.length === 0 && (
            <div className="text-center font-mono text-xs text-[var(--text-secondary)] py-8">
              {t('noMatchExpert')}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：配置编辑器 */}
      <div className="flex-1 flex flex-col overflow-hidden border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              /// {selectedExpert ? selectedExpert.name.toUpperCase() : t('config')}
            </span>
          </div>
          {selectedExpert && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 border-2 font-mono text-xs font-bold uppercase transition-all',
                  previewMode
                    ? 'border-[var(--accent-hover)] bg-[var(--accent-hover)] text-black'
                    : 'border-[var(--border-color)] bg-[var(--bg-page)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                )}
              >
                <Play className="w-3.5 h-3.5" />
                {previewMode ? t('editMode') : t('previewMode')}
              </button>
            </div>
          )}
        </div>

        {/* 更新时间 */}
        {selectedExpert && (
          <div className="px-4 py-2 border-b-2 border-[var(--border-color)] bg-[var(--bg-page)]">
            <span className="font-mono text-[10px] text-[var(--text-secondary)]">
              {t('lastUpdated')}: {new Date(selectedExpert.updated_at).toLocaleString()}
            </span>
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto bauhaus-scrollbar p-5">
          {selectedExpert ? (
            <div className="space-y-6">
              {!previewMode ? (
                <>
                  {/* 模型选择 - 使用可复用组件 */}
                  <ModelSelector
                    value={formData.model}
                    onChange={(modelId) => handleFieldChange('model', modelId)}
                    label={t('modelConfig')}
                  />

                  {/* 温度参数 - Bauhaus 风格 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                      <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                        {t('temperature')}: {formData.temperature?.toFixed(1)}
                      </label>
                    </div>
                    <div className="relative h-8 bg-[var(--bg-page)] border-2 border-[var(--border-color)]" style={{ zIndex: 10 }}>
                      {/* 进度条背景 */}
                      <div
                        className="absolute top-0 left-0 h-full bg-[var(--accent-hover)] transition-all pointer-events-none"
                        style={{ width: `${((formData.temperature ?? 0.5) / 2) * 100}%` }}
                      />
                      {/* 滑块手柄 */}
                      <div
                        className="absolute top-0 w-4 h-full bg-[var(--text-primary)] border-2 border-[var(--border-color)] transition-all pointer-events-none"
                        style={{ left: `calc(${((formData.temperature ?? 0.5) / 2) * 100}% - 8px)` }}
                      />
                      {/* 实际的 range input */}
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={formData.temperature ?? 0.5}
                        onChange={(e) => handleFieldChange('temperature', parseFloat(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        style={{ WebkitAppearance: 'none', appearance: 'none' }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[9px] text-[var(--text-secondary)]">
                      <span>0.0 ({t('conservative')})</span>
                      <span>1.0 ({t('balanced')})</span>
                      <span>2.0 ({t('creative')})</span>
                    </div>
                  </div>

                  {/* 能力描述 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                        <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                          {t('expertDescription')}
                        </label>
                      </div>
                      <button
                        onClick={handleGenerateDescription}
                        disabled={isGeneratingDescription || formData.system_prompt.length < 10}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase',
                          'border border-[var(--border-color)] bg-[var(--bg-page)]',
                          'hover:bg-[var(--accent-hover)] hover:text-black hover:border-[var(--accent-hover)]',
                          'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                        title={t('autoGenerateDescriptionTooltip')}
                      >
                        {isGeneratingDescription ? (
                          <>
                            <div className="w-3 h-3 border-2 border-current border-t-transparent animate-spin"></div>
                            {t('generating')}
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            {t('autoGenerate')}
                          </>
                        )}
                      </button>
                    </div>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => handleFieldChange('description', e.target.value)}
                      placeholder={t('expertDescriptionPlaceholder')}
                      rows={3}
                      className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors resize-y min-h-[80px] bauhaus-scrollbar"
                    />
                    <p className="font-mono text-[9px] text-[var(--text-secondary)]">
                      {t('expertDescriptionTooltip')}
                    </p>
                  </div>

                  {/* 系统提示词 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                      <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                        {t('systemPrompt')}
                      </label>
                    </div>
                    <textarea
                      value={formData.system_prompt}
                      onChange={(e) => handleFieldChange('system_prompt', e.target.value)}
                      placeholder={t('systemPromptPlaceholder')}
                      rows={10}
                      className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors resize-y min-h-[150px] bauhaus-scrollbar"
                    />
                    <div className="flex justify-between font-mono text-[9px] text-[var(--text-secondary)]">
                      <span>{formData.system_prompt.length} {t('chars')}</span>
                      <span className={formData.system_prompt.length < 10 ? 'text-red-500' : ''}>
                        {t('minChars')}: 10
                      </span>
                    </div>
                  </div>

                  {/* 保存按钮 */}
                  <div className="flex justify-end pt-4 border-t-2 border-[var(--border-color)]">
                    <button
                      onClick={handleSave}
                      disabled={isSaving || formData.system_prompt.length < 10}
                      className={cn(
                        'flex items-center gap-2 px-6 py-2 border-2 border-[var(--border-color)]',
                        'bg-[var(--accent-hover)] text-black font-mono text-xs font-bold uppercase',
                        'shadow-[var(--shadow-color)_3px_3px_0_0]',
                        'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_4px_4px_0_0]',
                        'active:translate-x-[0px] active:translate-y-[0px] active:shadow-none',
                        'transition-all',
                        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0'
                      )}
                    >
                      {isSaving ? (
                        <>
                          <div className="w-3 h-3 border-2 border-black/30 border-t-black animate-spin"></div>
                          {t('saving')}
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          {t('saveConfig')}
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* 预览模式 */}
                  <div className="space-y-6">
                    {/* 测试输入 */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                        <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                          {t('testInput')}
                        </label>
                      </div>
                      <textarea
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        placeholder={t('testInputPlaceholder')}
                        rows={5}
                        className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors resize-none"
                      />
                      <div className="flex justify-between font-mono text-[9px] text-[var(--text-secondary)]">
                        <span>{testInput.length} {t('chars')}</span>
                        <span className={testInput.length < 10 ? 'text-red-500' : ''}>
                          {t('minChars')}: 10
                        </span>
                      </div>
                    </div>

                    {/* 预览按钮 */}
                    <div className="flex justify-end">
                      <button
                        onClick={handlePreview}
                        disabled={isPreviewing || testInput.length < 10}
                        className={cn(
                          'flex items-center gap-2 px-6 py-2 border-2 border-[var(--border-color)]',
                          'bg-[var(--accent-hover)] text-black font-mono text-xs font-bold uppercase',
                          'shadow-[var(--shadow-color)_3px_3px_0_0]',
                          'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_4px_4px_0_0]',
                          'active:translate-x-[0px] active:translate-y-[0px] active:shadow-none',
                          'transition-all',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {isPreviewing ? (
                          <>
                            <div className="w-3 h-3 border-2 border-black/30 border-t-black animate-spin"></div>
                            {t('running')}
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            {t('startPreview')}
                          </>
                        )}
                      </button>
                    </div>

                    {/* 预览结果 */}
                    {previewResult && (
                      <div className="space-y-4 border-t-2 border-[var(--border-color)] pt-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-[var(--accent-hover)]"></div>
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                            /// {t('results')}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)]">
                            <div className="font-mono text-[9px] text-[var(--text-secondary)] uppercase">{t('model')}</div>
                            <div className="font-mono text-xs font-bold text-[var(--text-primary)] mt-1">
                              {previewResult.model}
                            </div>
                          </div>
                          <div className="p-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)]">
                            <div className="font-mono text-[9px] text-[var(--text-secondary)] uppercase">{t('temp')}</div>
                            <div className="font-mono text-xs font-bold text-[var(--text-primary)] mt-1">
                              {previewResult.temperature}
                            </div>
                          </div>
                        </div>

                        <div className="p-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-[9px] text-[var(--text-secondary)] uppercase">
                              {t('response')}
                            </span>
                            <span className="font-mono text-[9px] text-[var(--text-secondary)]">
                              {(previewResult.execution_time_ms / 1000).toFixed(2)}{t('secondsAbbr')}
                            </span>
                          </div>
                          <div className="font-mono text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                            {previewResult.preview_response}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-96 font-mono text-xs text-[var(--text-secondary)] uppercase">
              {t('selectExpertPrompt')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
