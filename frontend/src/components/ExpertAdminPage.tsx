import { useState, useEffect } from 'react'
import { Save, RefreshCw, Loader2, Play, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
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
  const [experts, setExperts] = useState<ExpertResponse[]>([])
  const [selectedExpert, setSelectedExpert] = useState<ExpertResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
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

  const { toast } = useToast()

  // 支持的模型列表
  const MODEL_OPTIONS = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'deepseek-chat',
  ]

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
        title: '加载失败',
        description: '无法加载专家列表，请重试',
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
      // 切换专家时重置预览状态
      setPreviewResult(null)
      setTestInput('')
      setPreviewMode(false)
    } catch (error) {
      logger.error('Failed to load expert:', error)
      toast({
        title: '加载失败',
        description: '无法加载专家配置',
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
        title: '保存成功',
        description: `专家配置已更新，下次任务生效`,
      })
    } catch (error) {
      logger.error('Failed to update expert:', error)
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '无法保存专家配置',
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
        title: '预览失败',
        description: '测试输入至少需要 10 个字符',
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
        title: '预览成功',
        description: `执行时间: ${(result.execution_time_ms / 1000).toFixed(2)} 秒`,
      })
    } catch (error) {
      logger.error('Failed to preview expert:', error)
      toast({
        title: '预览失败',
        description: error instanceof Error ? error.message : '无法预览专家响应',
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
      title: '刷新成功',
      description: '专家列表已更新',
    })
  }

  // 表单字段更新
  const handleFieldChange = (
    field: keyof ExpertUpdateRequest,
    value: string | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    loadExperts()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">加载专家列表...</span>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-full">
      {/* 左侧：专家列表 */}
      <Card className="w-80 flex-shrink-0">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">专家列表</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              title="刷新"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {experts.map((expert) => (
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
        </CardContent>
      </Card>

      {/* 右侧：配置编辑器 */}
      <Card className="flex-1">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {selectedExpert ? `${selectedExpert.name} 配置` : '选择专家'}
            </CardTitle>
            {selectedExpert && (
              <div className="flex items-center gap-2">
                <Button
                  variant={previewMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewMode(!previewMode)}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {previewMode ? '编辑模式' : '预览模式'}
                </Button>
              </div>
            )}
          </div>
          {selectedExpert && (
            <div className="text-sm text-gray-500 mt-2">
              最后更新：{new Date(selectedExpert.updated_at).toLocaleString()}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-6">
          {selectedExpert ? (
            <div className="space-y-6">
              {/* 编辑模式 */}
              {!previewMode && (
                <>
                  {/* 专家标识（只读） */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      专家标识
                    </label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md text-gray-600 dark:text-gray-400">
                      {selectedExpert.expert_key}
                    </div>
                  </div>

                  {/* 模型选择 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      模型
                    </label>
                    <Select
                      value={formData.model}
                      onValueChange={(value) => handleFieldChange('model', value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_OPTIONS.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 温度参数 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      温度参数: {formData.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={formData.temperature}
                      onChange={(e) =>
                        handleFieldChange('temperature', parseFloat(e.target.value))
                      }
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0.0 (精确)</span>
                      <span>1.0 (平衡)</span>
                      <span>2.0 (创意)</span>
                    </div>
                  </div>

                  {/* 系统提示词 */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      系统提示词
                    </label>
                    <Textarea
                      value={formData.system_prompt}
                      onChange={(e) =>
                        handleFieldChange('system_prompt', e.target.value)
                      }
                      placeholder="输入专家的系统提示词..."
                      className="min-h-[400px] font-mono text-sm"
                    />
                    <div className="text-xs text-gray-500 mt-2 text-right">
                      {formData.system_prompt.length} 个字符
                    </div>
                  </div>

                  {/* 保存按钮 */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || formData.system_prompt.length < 10}
                      className="min-w-[120px]"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          保存配置
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}

              {/* 预览模式 */}
              {previewMode && (
                <>
                  {/* 测试输入 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      测试输入
                    </label>
                    <Textarea
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      placeholder="输入测试文本（至少 10 个字符）..."
                      className="min-h-[100px] font-mono text-sm"
                    />
                    <div className="text-xs text-gray-500 mt-2 text-right">
                      {testInput.length} / 10 最小字符
                    </div>
                  </div>

                  {/* 预览按钮 */}
                  <div className="flex justify-end">
                    <Button
                      onClick={handlePreview}
                      disabled={isPreviewing || testInput.length < 10}
                      className="min-w-[120px]"
                    >
                      {isPreviewing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          预览中...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          开始预览
                        </>
                      )}
                    </Button>
                  </div>

                  {/* 预览结果 */}
                  {previewResult && (
                    <div className="mt-6 space-y-4">
                      <div className="border-t pt-4">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          预览结果
                        </h3>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-gray-500">使用模型</div>
                            <div className="text-sm font-medium">{previewResult.model}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">温度参数</div>
                            <div className="text-sm font-medium">{previewResult.temperature}</div>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500 mb-1">
                            专家响应（执行时间: {(previewResult.execution_time_ms / 1000).toFixed(2)} 秒）
                          </div>
                          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                            {previewResult.preview_response}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-96 text-gray-500">
              请从左侧选择一个专家进行配置
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
