import { useState, useEffect } from 'react'
import { Save, RefreshCw, Loader2, Play, Search, Check, X } from 'lucide-react'
import { models } from '@/config/models'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  getAllExperts,
  getExpert,
  updateExpert,
  previewExpert,
  type ExpertResponse,
  type ExpertUpdateRequest,
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

export default function ExpertAdminPage() {
  const { t } = useTranslation()
  const [experts, setExperts] = useState<ExpertResponse[]>([])
  const [selectedExpert, setSelectedExpert] = useState<ExpertResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState<ExpertUpdateRequest>({
    system_prompt: '',
    model: 'gpt-4o',
    temperature: 0.5,
  })

  // Toast 状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // 预览相关状态
  const [previewMode, setPreviewMode] = useState(false)
  const [testInput, setTestInput] = useState('')
  const [previewResult, setPreviewResult] = useState<any>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  // 模型选择状态（两级联动）
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    const availableProviders = models.map(m => m.provider)
    const uniqueProviders = Array.from(new Set(availableProviders))
    return uniqueProviders[0] || 'deepseek'
  })
  const [selectedModel, setSelectedModel] = useState<string>('')

  // 下拉菜单显示状态
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)

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
      setToast({ message: '加载失败', type: 'error' })
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
        model: data.model,
        temperature: data.temperature,
      })

      const modelConfig = models.find(m => m.id === data.model)
      if (modelConfig) {
        setSelectedProvider(modelConfig.provider)
        setSelectedModel(modelConfig.id)
      }

      setPreviewResult(null)
      setTestInput('')
      setPreviewMode(false)
    } catch (error) {
      logger.error('Failed to load expert:', error)
      setToast({ message: '加载专家失败', type: 'error' })
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
      setToast({ message: '保存成功', type: 'success' })
    } catch (error) {
      logger.error('Failed to update expert:', error)
      setToast({ message: '保存失败', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  // 预览专家响应
  const handlePreview = async () => {
    if (!selectedExpert || testInput.length < 10) {
      setToast({ message: '测试输入至少需要10个字符', type: 'error' })
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
      setToast({ message: `执行完成 (${(result.execution_time_ms / 1000).toFixed(2)}s)`, type: 'success' })
    } catch (error) {
      logger.error('Failed to preview expert:', error)
      setToast({ message: '预览失败', type: 'error' })
    } finally {
      setIsPreviewing(false)
    }
  }

  // 刷新所有专家
  const handleRefresh = async () => {
    await loadExperts()
    setToast({ message: '刷新成功', type: 'success' })
  }

  // 表单字段更新
  const handleFieldChange = (
    field: keyof ExpertUpdateRequest,
    value: string | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // 过滤专家列表
  const filteredExperts = experts.filter(expert =>
    expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expert.expert_key.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 获取唯一供应商列表
  const providers = Array.from(new Set(models.map(m => m.provider)))

  // 获取当前供应商的模型列表
  const currentProviderModels = models.filter(m => m.provider === selectedProvider)

  useEffect(() => {
    loadExperts()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-[var(--border-color)] border-t-[var(--accent-hover)] animate-spin"></div>
        <span className="ml-3 font-mono text-sm text-[var(--text-secondary)]">LOADING...</span>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-screen p-4 bg-[var(--bg-page)]">
      {/* Toast */}
      {toast && (
        <BauhausToast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* 左侧：专家列表 */}
      <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              /// EXPERTS
            </span>
          </div>
          <button
            onClick={handleRefresh}
            className="w-7 h-7 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-hover)] transition-colors"
            title={t('refresh')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="p-3 border-b-2 border-[var(--border-color)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="SEARCH..."
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
                  'w-full text-left px-3 py-3 border-2 transition-all relative',
                  selectedExpert?.expert_key === expert.expert_key
                    ? 'border-[var(--accent-hover)] bg-[var(--accent-hover)] text-black shadow-[var(--shadow-color)_2px_2px_0_0]'
                    : 'border-transparent hover:border-[var(--border-color)] hover:bg-[var(--bg-page)]'
                )}
              >
                {/* 选中指示器 */}
                {selectedExpert?.expert_key === expert.expert_key && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-black" />
                )}
                <div className={cn(
                  "font-mono text-sm font-bold",
                  selectedExpert?.expert_key === expert.expert_key ? 'text-black' : 'text-[var(--text-primary)]'
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
              未找到匹配的专家
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
              /// {selectedExpert ? selectedExpert.name.toUpperCase() : 'CONFIG'}
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
                {previewMode ? 'EDIT_MODE' : 'PREVIEW'}
              </button>
            </div>
          )}
        </div>

        {/* 更新时间 */}
        {selectedExpert && (
          <div className="px-4 py-2 border-b-2 border-[var(--border-color)] bg-[var(--bg-page)]">
            <span className="font-mono text-[10px] text-[var(--text-secondary)]">
              LAST_UPDATED: {new Date(selectedExpert.updated_at).toLocaleString()}
            </span>
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto bauhaus-scrollbar p-5">
          {selectedExpert ? (
            <div className="space-y-6">
              {!previewMode ? (
                <>
                  {/* 模型选择 - Bauhaus 风格两级联动 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                      <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                        MODEL_CONFIG
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* 供应商选择 */}
                      <div className="relative">
                        <label className="font-mono text-[9px] text-[var(--text-secondary)] mb-1 block uppercase">
                          Provider
                        </label>
                        <button
                          onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                          className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-xs text-left flex items-center justify-between hover:border-[var(--accent-hover)] transition-colors"
                        >
                          <span className="uppercase">{selectedProvider}</span>
                          <span className="text-[var(--text-secondary)]">▼</span>
                        </button>
                        {showProviderDropdown && (
                          <div className="absolute top-full left-0 right-0 mt-1 border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] z-20">
                            {providers.map((provider) => (
                              <button
                                key={provider}
                                onClick={() => {
                                  setSelectedProvider(provider)
                                  const firstModel = models.find(m => m.provider === provider)
                                  if (firstModel) {
                                    setSelectedModel(firstModel.id)
                                    handleFieldChange('model', firstModel.id)
                                  }
                                  setShowProviderDropdown(false)
                                }}
                                className={cn(
                                  'w-full px-3 py-2 text-left font-mono text-xs uppercase hover:bg-[var(--accent-hover)]/10 transition-colors',
                                  selectedProvider === provider && 'bg-[var(--accent-hover)]/20'
                                )}
                              >
                                {provider}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 模型选择 */}
                      <div className="relative">
                        <label className="font-mono text-[9px] text-[var(--text-secondary)] mb-1 block uppercase">
                          Model
                        </label>
                        <button
                          onClick={() => setShowModelDropdown(!showModelDropdown)}
                          className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-xs text-left flex items-center justify-between hover:border-[var(--accent-hover)] transition-colors"
                        >
                          <span>{models.find(m => m.id === selectedModel)?.name || 'Select'}</span>
                          <span className="text-[var(--text-secondary)]">▼</span>
                        </button>
                        {showModelDropdown && (
                          <div className="absolute top-full left-0 right-0 mt-1 border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] z-20 max-h-40 overflow-y-auto bauhaus-scrollbar">
                            {currentProviderModels.map((model) => (
                              <button
                                key={model.id}
                                onClick={() => {
                                  setSelectedModel(model.id)
                                  handleFieldChange('model', model.id)
                                  setShowModelDropdown(false)
                                }}
                                className={cn(
                                  'w-full px-3 py-2 text-left font-mono text-xs hover:bg-[var(--accent-hover)]/10 transition-colors',
                                  selectedModel === model.id && 'bg-[var(--accent-hover)]/20'
                                )}
                              >
                                {model.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 温度参数 - Bauhaus 风格 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                      <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                        TEMPERATURE: {formData.temperature?.toFixed(1)}
                      </label>
                    </div>
                    <div className="relative h-8 bg-[var(--bg-page)] border-2 border-[var(--border-color)]">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={formData.temperature ?? 0.5}
                        onChange={(e) => handleFieldChange('temperature', parseFloat(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="absolute top-0 left-0 h-full bg-[var(--accent-hover)] transition-all"
                        style={{ width: `${((formData.temperature ?? 0.5) / 2) * 100}%` }}
                      />
                      <div
                        className="absolute top-0 w-4 h-full bg-[var(--text-primary)] border-2 border-[var(--border-color)] transition-all"
                        style={{ left: `calc(${((formData.temperature ?? 0.5) / 2) * 100}% - 8px)` }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[9px] text-[var(--text-secondary)]">
                      <span>0.0 (保守)</span>
                      <span>1.0 (平衡)</span>
                      <span>2.0 (创意)</span>
                    </div>
                  </div>

                  {/* 系统提示词 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                      <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                        SYSTEM_PROMPT
                      </label>
                    </div>
                    <textarea
                      value={formData.system_prompt}
                      onChange={(e) => handleFieldChange('system_prompt', e.target.value)}
                      placeholder={t('systemPromptPlaceholder')}
                      rows={10}
                      className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors resize-y min-h-[150px]"
                    />
                    <div className="flex justify-between font-mono text-[9px] text-[var(--text-secondary)]">
                      <span>{formData.system_prompt.length} CHARS</span>
                      <span className={formData.system_prompt.length < 10 ? 'text-red-500' : ''}>
                        MIN: 10
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
                          SAVING...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          SAVE_CONFIG
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
                          TEST_INPUT
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
                        <span>{testInput.length} CHARS</span>
                        <span className={testInput.length < 10 ? 'text-red-500' : ''}>
                          MIN: 10
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
                            RUNNING...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            START_PREVIEW
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
                            /// RESULTS
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)]">
                            <div className="font-mono text-[9px] text-[var(--text-secondary)] uppercase">MODEL</div>
                            <div className="font-mono text-xs font-bold text-[var(--text-primary)] mt-1">
                              {previewResult.model}
                            </div>
                          </div>
                          <div className="p-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)]">
                            <div className="font-mono text-[9px] text-[var(--text-secondary)] uppercase">TEMP</div>
                            <div className="font-mono text-xs font-bold text-[var(--text-primary)] mt-1">
                              {previewResult.temperature}
                            </div>
                          </div>
                        </div>

                        <div className="p-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-[9px] text-[var(--text-secondary)] uppercase">
                              RESPONSE
                            </span>
                            <span className="font-mono text-[9px] text-[var(--text-secondary)]">
                              {(previewResult.execution_time_ms / 1000).toFixed(2)}s
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
