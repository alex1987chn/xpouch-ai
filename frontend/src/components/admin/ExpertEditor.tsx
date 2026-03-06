/**
 * ExpertEditor - 专家编辑器组件
 *
 * [职责]
 * 右侧编辑器区域，包含：
 * - 模型选择
 * - 温度滑块
 * - 能力描述（自动生成）
 * - System Prompt 编辑
 * - 预览模式
 * - 保存按钮
 *
 * [状态管理]
 * 使用 key 模式：父组件通过 key 控制重置，切换专家时自动重新初始化
 */

import { useState, useEffect } from 'react'
import { Save, Play, Sparkles, Lightbulb, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import ModelSelector from '@/components/settings/ModelSelector'
import type {
  SystemExpert,
  PreviewExpertResponse,
  UpdateExpertRequest,
  ToolInfo,
} from '@/services/admin'
import { previewExpert, getAvailableTools } from '@/services/admin'

interface ExpertEditorProps {
  expert: SystemExpert | null
  isAdmin: boolean
  isSaving: boolean
  isGeneratingDescription: boolean
  onSave: (data: UpdateExpertRequest) => void
  onGenerateDescription: (systemPrompt: string) => Promise<string>
  onShowToast: (message: string, type: 'success' | 'error') => void
}

export default function ExpertEditor({
  expert,
  isAdmin,
  isSaving,
  isGeneratingDescription,
  onSave,
  onGenerateDescription,
  onShowToast,
}: ExpertEditorProps) {
  const { t } = useTranslation()

  // 内部状态：表单数据（key 模式保证 expert 是最新的）
  const [formData, setFormData] = useState<UpdateExpertRequest>({
    system_prompt: expert?.system_prompt || '',
    description: expert?.description || '',
    model: expert?.model || 'gpt-4o',
    temperature: expert?.temperature ?? 0.5,
  })

  const [previewMode, setPreviewMode] = useState(false)
  const [testInput, setTestInput] = useState('')
  const [previewResult, setPreviewResult] = useState<PreviewExpertResponse | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  // 🔥 工具提示展开状态
  const [showToolTips, setShowToolTips] = useState(false)
  // 🔥 工具列表
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [isLoadingTools, setIsLoadingTools] = useState(false)

  // 表单字段更新
  const handleFieldChange = (field: keyof UpdateExpertRequest, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // 获取工具列表
  useEffect(() => {
    setIsLoadingTools(true)
    getAvailableTools()
      .then((response) => {
        setTools(response.tools)
      })
      .catch((err) => {
        logger.error('Failed to load tools', err)
      })
      .finally(() => {
        setIsLoadingTools(false)
      })
  }, [])

  // 保存
  const handleSave = () => {
    onSave(formData)
  }

  // 自动生成描述
  const handleGenerateDescription = async () => {
    if (!formData.system_prompt || formData.system_prompt.length < 10) {
      onShowToast(t('systemPromptTooShort'), 'error')
      return
    }
    try {
      const description = await onGenerateDescription(formData.system_prompt)
      setFormData((prev) => ({ ...prev, description }))
      onShowToast(t('descriptionGenerated'), 'success')
    } catch (_error) {
      onShowToast(t('generateDescriptionFailed'), 'error')
    }
  }

  // 预览专家响应
  const handlePreview = async () => {
    if (!expert || testInput.length < 10) {
      onShowToast(t('testInputMinCharsError'), 'error')
      return
    }

    setIsPreviewing(true)
    setPreviewResult(null)
    try {
      const result = await previewExpert({
        expert_key: expert.expert_key,
        test_input: testInput,
      })
      setPreviewResult(result)
      onShowToast(
        `${t('executionCompleted')} (${(result.execution_time_ms / 1000).toFixed(2)}${t('secondsAbbr')})`,
        'success'
      )
    } catch (_error) {
      onShowToast(t('previewFailed'), 'error')
    } finally {
      setIsPreviewing(false)
    }
  }

  if (!expert) {
    return (
      <div className="flex-1 flex items-center justify-center border-2 border-border-default bg-surface-card shadow-theme-card">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-border-default bg-surface-page mx-auto mb-4 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-content-secondary" />
          </div>
          <p className="text-sm text-content-secondary">
            选择专家以编辑
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden border-2 border-border-default bg-surface-card shadow-theme-card relative">
      {/* 非管理员遮罩层 */}
      {!isAdmin && (
        <div className="absolute inset-0 z-50 bg-surface-page/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-2 border-border-default bg-surface-card mx-auto mb-4 flex items-center justify-center">
              <Lock className="w-8 h-8 text-content-muted" />
            </div>
            <p className="text-sm font-bold text-content-primary mb-2">
              {t('adminOnly')}
            </p>
            <p className="text-xs text-content-secondary">
              仅管理员可编辑专家配置
            </p>
          </div>
        </div>
      )}

      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-accent-hover" />
          <span className="text-xs font-bold uppercase tracking-widest text-content-secondary">
            /// {expert.name.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 border-2 border-border-default text-xs font-bold uppercase transition-all',
              previewMode
                ? 'border-accent-hover bg-accent-hover text-content-primary'
                : 'border-border-default bg-surface-page text-content-secondary hover:border-content-secondary'
            )}
          >
            <Play className="w-3.5 h-3.5" />
            {previewMode ? t('editMode') : t('previewMode')}
          </button>
        </div>
      </div>

      {/* 更新时间 */}
      <div className="px-4 py-2 border-b-2 border-border-default bg-surface-page">
        <span className="text-[10px] text-content-secondary">
          {t('lastUpdated')}: {new Date(expert.updated_at).toLocaleString()}
        </span>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto bauhaus-scrollbar p-5">
        <div className="space-y-6">
          {!previewMode ? (
            <>
              {/* 模型选择 */}
              <div>
                <ModelSelector
                  value={formData.model}
                  onChange={(modelId) => handleFieldChange('model', modelId)}
                  label={t('modelConfig')}
                />
              </div>

              {/* 温度参数 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-content-secondary" />
                  <label className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                    {t('temperature')}: {formData.temperature?.toFixed(1)}
                  </label>
                </div>
                <div
                  className="relative h-8 bg-surface-page border-2 border-border-default shadow-theme-input"
                  style={{ zIndex: 10 }}
                >
                  {/* 进度条 - 使用品牌强调色 */}
                  <div
                    className="absolute top-0 left-0 h-full bg-accent transition-all pointer-events-none"
                    style={{
                      width: `${((formData.temperature ?? 0.5) / 2) * 100}%`,
                    }}
                  />
                  {/* Thumb - 使用内容主色，带主题边框 */}
                  <div
                    className="absolute top-0 w-4 h-full bg-content-primary border-2 border-border-default transition-all pointer-events-none"
                    style={{
                      left: `calc(${((formData.temperature ?? 0.5) / 2) * 100}% - 8px)`,
                    }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.temperature ?? 0.5}
                    onChange={(e) =>
                      handleFieldChange('temperature', parseFloat(e.target.value))
                    }
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    style={{ WebkitAppearance: 'none', appearance: 'none' }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-content-secondary">
                  <span>0.0 ({t('conservative')})</span>
                  <span>1.0 ({t('balanced')})</span>
                  <span>2.0 ({t('creative')})</span>
                </div>
              </div>

              {/* 能力描述 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-content-secondary" />
                    <label className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                      {t('expertDescription')}
                    </label>
                  </div>
                  {/* 自动生成按钮 - 仅管理员可见 */}
                  {isAdmin && (
                  <button
                    onClick={handleGenerateDescription}
                    disabled={isGeneratingDescription || formData.system_prompt.length < 10}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 text-[10px] uppercase',
                      'border-2 border-border-default bg-surface-page',
                      'hover:bg-accent-hover hover:text-content-primary hover:border-accent-hover',
                      'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                    title={t('autoGenerateDescriptionTooltip')}
                  >
                    {isGeneratingDescription ? (
                      <>
                        <div className="w-3 h-3 border border-current border-t-transparent animate-spin" />
                        {t('generating')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        {t('autoGenerate')}
                      </>
                    )}
                  </button>
                  )}
                </div>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder={t('expertDescriptionPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors resize-y min-h-[80px] bauhaus-scrollbar"
                />
                <p className="text-[9px] text-content-secondary">
                  {t('expertDescriptionTooltip')}
                </p>
              </div>

              {/* 系统提示词 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-content-secondary" />
                    <label className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                      {t('systemPrompt')}
                    </label>
                  </div>
                  {/* 🔥 工具使用提示 */}
                  <button
                    type="button"
                    onClick={() => setShowToolTips(!showToolTips)}
                    className="flex items-center gap-1 text-[9px] text-accent-hover hover:text-accent transition-colors"
                  >
                    <Lightbulb className="w-3 h-3" />
                    {showToolTips ? t('hideToolTips') : t('showToolTips')}
                    {showToolTips ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* 🔥 工具使用说明模板 */}
                {showToolTips && (
                  <div className="p-3 border-2 border-border-default bg-accent-hover/5 space-y-2">
                    <p className="text-[9px] text-content-secondary">
                      {t('toolTipsDescription')}
                    </p>
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-content-secondary">
                        {t('availableTools')}:
                        {isLoadingTools && <span className="ml-2 text-content-secondary/50">({t('loading')})</span>}
                      </p>
                      {tools.length > 0 ? (
                        <ul className="text-[9px] text-content-secondary space-y-1 ml-2 max-h-32 overflow-y-auto bauhaus-scrollbar">
                          {tools.map((tool) => (
                            <li key={tool.name}>
                              • <code className="bg-surface-page px-1">{tool.name}</code>
                              <span className="text-content-secondary/70"> - {tool.description}</span>
                              {tool.category === 'mcp' && (
                                <span className="ml-1 text-[8px] text-accent-hover">(MCP)</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[9px] text-content-secondary/50 ml-2">
                          {isLoadingTools ? t('loadingTools') : t('noToolsAvailable')}
                        </p>
                      )}
                    </div>
                    <div className="pt-1 border-t border-border-default">
                      <p className="text-[9px] font-bold text-content-secondary mb-1">{t('toolUsageExample')}:</p>
                      <pre className="text-[8px] text-content-secondary bg-surface-page p-2 overflow-x-auto">
{`# Tools & Constraints
1. **Mandatory Tool Use**: 当需要实时信息时，必须使用 \`search_web\`。
2. **Date Awareness**: 当前时间是 {current_time}。

# Output Format
...`}
                      </pre>
                    </div>
                  </div>
                )}

                <textarea
                  value={formData.system_prompt}
                  onChange={(e) => handleFieldChange('system_prompt', e.target.value)}
                  placeholder={t('systemPromptPlaceholder')}
                  rows={10}
                  className="w-full px-3 py-2 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors resize-y min-h-[150px] bauhaus-scrollbar"
                />
                <div className="flex justify-between text-[9px] text-content-secondary">
                  <span>{formData.system_prompt.length} {t('chars')}</span>
                  <span className={formData.system_prompt.length < 10 ? 'text-status-offline' : ''}>
                    {t('minChars')}: 10
                  </span>
                </div>
              </div>

              {/* 保存按钮 */}
              {isAdmin && (
                <div className="flex justify-end pt-4 border-t-2 border-border-default">
                  <button
                    onClick={handleSave}
                    disabled={isSaving || formData.system_prompt.length < 10}
                    className={cn(
                      'flex items-center gap-2 px-6 py-2 border-2 border-border-default',
                      'bg-accent-hover text-content-primary text-xs font-bold uppercase',
                      'shadow-theme-button-lg',
                      'hover:[transform:var(--transform-button-lg-hover)] hover:shadow-theme-button-lg-hover',
                      'active:[transform:var(--transform-button-active)] active:shadow-theme-button-active',
                      'transition-all',
                      'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:[transform:none]'
                    )}
                  >
                    {isSaving ? (
                      <>
                        <div className="w-3 h-3 border border-content-primary/30 border-t-content-primary animate-spin" />
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
              )}
            </>
          ) : (
            <>
              {/* 预览模式 */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-content-secondary" />
                    <label className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                      {t('testInput')}
                    </label>
                  </div>
                  <textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder={t('testInputPlaceholder')}
                    rows={5}
                    className="w-full px-3 py-2 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors resize-none"
                  />
                  <div className="flex justify-between text-[9px] text-content-secondary">
                    <span>{testInput.length} {t('chars')}</span>
                    <span className={testInput.length < 10 ? 'text-status-offline' : ''}>
                      {t('minChars')}: 10
                    </span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handlePreview}
                    disabled={isPreviewing || testInput.length < 10}
                    className={cn(
                      'flex items-center gap-2 px-6 py-2 border-2 border-border-default',
                      'bg-accent-hover text-content-primary text-xs font-bold uppercase',
                      'shadow-theme-button-lg',
                      'hover:[transform:var(--transform-button-lg-hover)] hover:shadow-theme-button-lg-hover',
                      'active:[transform:var(--transform-button-active)] active:shadow-theme-button-active',
                      'transition-all',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    {isPreviewing ? (
                      <>
                        <div className="w-3 h-3 border border-content-primary/30 border-t-content-primary animate-spin" />
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

                {previewResult && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-accent-hover" />
                        <label className="text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                          {t('previewResults')}
                        </label>
                      </div>
                      <span className="text-[9px] text-content-secondary">
                        {previewResult.model} · {previewResult.temperature} · {(previewResult.execution_time_ms / 1000).toFixed(2)}s
                      </span>
                    </div>
                    <div className="p-4 border-2 border-border-default bg-surface-page min-h-[200px]">
                      <pre className="text-sm whitespace-pre-wrap">
                        {previewResult.preview_response}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
