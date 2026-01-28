import { useState, useEffect } from 'react'
import { Save, RefreshCw, Loader2, Play, Search } from 'lucide-react'
import { models } from '@/config/models'
import { useToast } from '@/components/ui/use-toast'
import { useTranslation } from '@/i18n'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  getAllExperts,
  getExpert,
  updateExpert,
  previewExpert,
  type ExpertResponse,
  type ExpertUpdateRequest,
} from '@/services/admin'
import { logger } from '@/utils/logger'

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


  // 预览相关状态
  const [previewMode, setPreviewMode] = useState(false)
  const [testInput, setTestInput] = useState('')
  const [previewResult, setPreviewResult] = useState<any>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  // 模型选择状态（两级联动）
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    // 默认选择第一个可用的供应商
    const availableProviders = models.map(m => m.provider)
    const uniqueProviders = Array.from(new Set(availableProviders))
    return uniqueProviders[0] || 'deepseek'
  })
  const [selectedModel, setSelectedModel] = useState<string>('')

  const { toast } = useToast()

  // 加载专家列表
  const loadExperts = async () => {
    setIsLoading(true)
    try {
      const data = await getAllExperts()
      setExperts(data)
      // 默认选择第一个专家
      if (data.length > 0 && !selectedExpert) {
        await selectExpert(data[0].expert_key)
      }
    } catch (error) {
      logger.error('Failed to load experts:', error)
      toast({
        title: t('noMatchingHistory'), // 借用：未找到
        description: t('tryOtherKeywords'), // 借用：尝试其他关键词
        variant: 'destructive',
      })
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

      // 同步更新模型选择状态（两级联动）
      const modelConfig = models.find(m => m.id === data.model)
      if (modelConfig) {
        setSelectedProvider(modelConfig.provider)
        setSelectedModel(modelConfig.id)
      }

      // 切换专家时重置预览状态
      setPreviewResult(null)
      setTestInput('')
      setPreviewMode(false)
    } catch (error) {
      logger.error('Failed to load expert:', error)
      toast({
        title: t('noMatchingHistory'),
        description: t('tryOtherKeywords'),
        variant: 'destructive',
      })
    }
  }

  // 保存配置
  const handleSave = async () => {
    if (!selectedExpert) return

    setIsSaving(true)
    try {
      await updateExpert(selectedExpert.expert_key, formData)

      // 刷新专家列表
      await loadExperts()
      // 重新选择当前专家（更新 updated_at）
      await selectExpert(selectedExpert.expert_key)

      toast({
        title: t('save'),
        description: t('saveSuccess'),
      })
    } catch (error) {
      logger.error('Failed to update expert:', error)
      toast({
        title: t('saveFailed'),
        description: error instanceof Error ? error.message : t('tryOtherKeywords'),
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // 预览专家响应
  const handlePreview = async () => {
    if (!selectedExpert || testInput.length < 10) {
      toast({
        title: t('previewFailed'),
        description: t('testInputMinChars').replace('{count}', testInput.length.toString()),
        variant: 'destructive',
      })
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
      toast({
        title: t('previewSuccess'),
        description: t('seconds').replace('{time}', (result.execution_time_ms / 1000).toFixed(2)),
      })
    } catch (error) {
      logger.error('Failed to preview expert:', error)
      toast({
        title: t('previewFailed'),
        description: error instanceof Error ? error.message : t('tryOtherKeywords'),
        variant: 'destructive',
      })
    } finally {
      setIsPreviewing(false)
    }
  }

  // 刷新所有专家
  const handleRefresh = async () => {
    await loadExperts()
    toast({
      title: t('save'),
      description: t('recentChats'), // 借用：最近会话（用作"刷新成功"）
    })
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



  useEffect(() => {
    loadExperts()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">{t('loadingExperts')}</span>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-screen p-6">
      {/* 左侧：专家列表 */}
      <Card className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
        <CardHeader className="pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t('expertsList')}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              title={t('refresh')}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 overflow-y-auto flex-1">
          {/* 搜索框 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {/* 专家列表 */}
          <div className="space-y-2">
            {filteredExperts.map((expert) => (
              <button
                key={expert.id}
                onClick={() => selectExpert(expert.expert_key)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                  selectedExpert?.expert_key === expert.expert_key
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-600/80 dark:text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <div className="font-medium">{expert.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {expert.expert_key}
                </div>
              </button>
            ))}
          </div>
          {/* 无搜索结果提示 */}
          {filteredExperts.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">
              未找到匹配的专家
            </div>
          )}
        </CardContent>
      </Card>

      {/* 右侧：配置编辑器 */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {selectedExpert ? `${selectedExpert.name} ${t('modelConfig')}` : t('selectExpert')}
            </CardTitle>
            {selectedExpert && (
              <div className="flex items-center gap-2">
                <Button
                  variant={previewMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewMode(!previewMode)}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {previewMode ? t('editMode') : t('previewMode')}
                </Button>
              </div>
            )}
          </div>
          {selectedExpert && (
            <div className="text-sm text-gray-500 mt-2">
              {t('lastUpdated')}：{new Date(selectedExpert.updated_at).toLocaleString()}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-6 flex-1 flex flex-col overflow-hidden">
          {selectedExpert ? (
            <div className="flex flex-col h-full space-y-6">
              {/* 编辑模式 */}
              {!previewMode && (
                <div className="flex flex-col h-full">
                  {/* 内容区域 - 可滚动 */}
                  <div className="flex-1 overflow-y-auto space-y-6">
                    {/* 模型选择 - 两级联动 */}
                    <div className="flex-shrink-0">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('model')}
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {/* 供应商选择 */}
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">供应商</label>
                          <Select
                            value={selectedProvider}
                            onValueChange={(value) => {
                              setSelectedProvider(value)
                              // 切换供应商时，自动选择该供应商的第一个模型
                              const firstModel = models.find(m => m.provider === value)
                              if (firstModel) {
                                setSelectedModel(firstModel.id)
                                handleFieldChange('model', firstModel.id)
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from(new Set(models.map(m => m.provider))).map((provider) => (
                                <SelectItem key={provider} value={provider}>
                                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 模型选择 */}
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">模型</label>
                          <Select
                            value={selectedModel}
                            onValueChange={(value) => {
                              setSelectedModel(value)
                              handleFieldChange('model', value)
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {models.filter(m => m.provider === selectedProvider).map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* 温度参数 */}
                    <div className="flex-shrink-0">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('temperatureValue').replace('{value}', (formData.temperature ?? 0.5).toString())}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={formData.temperature ?? 0.5}
                        onChange={(e) =>
                          handleFieldChange('temperature', parseFloat(e.target.value))
                        }
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0.0 (保守)</span>
                        <span>1.0 (平衡)</span>
                        <span>2.0 (创造性)</span>
                      </div>
                    </div>

                    {/* 系统提示词 - 可调整大小 */}
                    <div className="flex-shrink-0">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('systemPrompt')}
                      </label>
                      <Textarea
                        value={formData.system_prompt}
                        onChange={(e) =>
                          handleFieldChange('system_prompt', e.target.value)
                        }
                        placeholder={t('systemPromptPlaceholder')}
                        className="font-mono text-sm resize-y h-[150px] min-h-[150px] max-h-[250px]"
                      />
                      <div className="text-xs text-gray-500 mt-2 text-right">
                        {t('characters').replace('{count}', formData.system_prompt.length.toString())}
                      </div>
                    </div>
                  </div>

                  {/* 保存按钮 - 固定在底部 */}
                  <div className="flex justify-end pt-4 border-t flex-shrink-0">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || formData.system_prompt.length < 10}
                      className="min-w-[120px]"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t('saving')}
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {t('saveConfig')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* 预览模式 */}
              {previewMode && (
                <div className="flex flex-col h-full">
                  {/* 内容区域 - 可滚动 */}
                  <div className="flex-1 overflow-y-auto space-y-6">
                    {/* 测试输入 */}
                    <div className="flex-shrink-0">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('testInput')}
                      </label>
                      <Textarea
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        placeholder={t('testInputPlaceholder')}
                        className="min-h-[100px] font-mono text-sm"
                      />
                      <div className="text-xs text-gray-500 mt-2 text-right">
                        {t('testInputMinChars').replace('{count}', testInput.length.toString())}
                      </div>
                    </div>

                    {/* 预览按钮 */}
                    <div className="flex justify-end flex-shrink-0">
                      <Button
                        onClick={handlePreview}
                        disabled={isPreviewing || testInput.length < 10}
                        className="min-w-[120px]"
                      >
                        {isPreviewing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {t('previewing')}
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            {t('startPreview')}
                          </>
                        )}
                      </Button>
                    </div>

                    {/* 预览结果 */}
                    {previewResult && (
                      <div className="space-y-4">
                        <div className="border-t pt-4">
                          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                            {t('previewResults')}
                          </h3>

                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-xs text-gray-500">{t('usedModel')}</div>
                              <div className="text-sm font-medium">{previewResult.model}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">{t('temperature')}</div>
                              <div className="text-sm font-medium">{previewResult.temperature}</div>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-gray-500 mb-1">
                              {t('expertResponse')} ({t('executionTime')}: {t('seconds').replace('{time}', (previewResult.execution_time_ms / 1000).toFixed(2))})
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                              {previewResult.preview_response}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-96 text-gray-500">
              {t('selectExpertPrompt')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
