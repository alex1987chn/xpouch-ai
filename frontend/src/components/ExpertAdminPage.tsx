import { useState, useEffect } from 'react'
import { Save, RefreshCw, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Textarea } from '@/components/ui/textarea'
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
          <CardTitle className="text-lg">
            {selectedExpert ? `${selectedExpert.name} 配置` : '选择专家'}
          </CardTitle>
          {selectedExpert && (
            <div className="text-sm text-gray-500 mt-2">
              最后更新：{new Date(selectedExpert.updated_at).toLocaleString()}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-6">
          {selectedExpert ? (
            <div className="space-y-6">
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
