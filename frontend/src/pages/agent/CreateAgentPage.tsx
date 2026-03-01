import { useState } from 'react'
import { ArrowLeft, Bot, Sparkles, Save } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import { useTaskStore } from '@/store/taskStore'
import { useApp } from '@/providers/AppProvider'
import ModelSelector from '@/components/settings/ModelSelector'

interface CreateAgentPageProps {
  onBack: () => void
  onSave: (agent: any) => void
  initialData?: {
    id: string
    name: string
    description: string
    systemPrompt: string
    category: string
    modelId: string
  }
  isEditMode?: boolean
}

// Bauhaus 风格进度条组件
function BauhausProgressBar({ current, max }: { current: number; max: number }) {
  const { t } = useTranslation()
  const progress = Math.min(current / max, 1)
  const filledCount = Math.floor(progress * 20)

  return (
    <div className="space-y-2">
      {/* 像素进度条 - Bauhaus风格 */}
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 20 }).map((_, i) => {
          const isFilled = i < filledCount
          return (
            <div
              key={i}
              className={cn(
                'w-3 h-4 border border-border-default transition-all duration-200',
                isFilled
                  ? 'bg-accent-hover'
                  : 'bg-surface-page'
              )}
            />
          )
        })}
      </div>

      {/* 字数统计 */}
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-content-secondary">
          {current} / {max} {t('chars')}
        </span>
        <span className={cn(
          'font-bold uppercase',
          progress >= 1
            ? 'text-green-600'
            : progress >= 0.8
              ? 'text-accent-hover'
              : 'text-content-secondary'
        )}>
          {progress >= 1 ? t('complete') : progress >= 0.8 ? t('almost') : t('input')}
        </span>
      </div>
    </div>
  )
}

export default function CreateAgentPage({ onBack, onSave, initialData, isEditMode = false }: CreateAgentPageProps) {
  const { t } = useTranslation()
  const { sidebar } = useApp()
  // 直接用 initialData 初始化状态，避免 useEffect 同步 Props 反模式
  // 父组件通过 key 属性控制组件重置时机
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [systemPrompt, setSystemPrompt] = useState(initialData?.systemPrompt || '')
  const [category, setCategory] = useState(initialData?.category || t('general'))
  const [selectedModel, setSelectedModel] = useState(initialData?.modelId || 'deepseek-chat')

  const { swipeProgress, handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({
    enabled: true,
    onSwipe: onBack
  })

  // 登录状态检查
  const isAuthenticated = useUserStore(state => state.isAuthenticated)
  const setLoginDialogOpen = useTaskStore(state => state.setLoginDialogOpen)

  const handleSave = () => {
    if (!name || !systemPrompt) return

    // 🔐 未登录时弹出登录弹窗
    if (!isAuthenticated) {
      setLoginDialogOpen(true)
      return
    }

    const agentData = {
      id: isEditMode && initialData ? initialData.id : `user-agent-${Date.now()}`,
      name,
      description,
      systemPrompt,
      category,
      modelId: selectedModel,
      icon: <Bot className="w-5 h-5" />,
      color: 'from-violet-500 to-fuchsia-500'
    }

    onSave(agentData)
  }

  const categories = [t('categoryGeneral'), t('categoryDev'), t('categoryCreate'), t('categoryAnalyze'), t('categoryResearch')]

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 顶部 Bauhaus Header */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-40 h-14 px-6 border-b-2 border-border-default bg-surface-card transition-all duration-200",
          sidebar.isCollapsed ? "lg:pl-[88px]" : "lg:pl-[320px]"
        )}
      >
        <div className="w-full max-w-7xl mx-auto h-full flex items-center justify-between">
          {/* 左侧：返回按钮 + 标题 */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center justify-center w-9 h-9 border-2 border-border-default hover:bg-accent-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-hover"></div>
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
                /// {isEditMode ? t('editAgent') : t('createAgent')}
              </span>
            </div>
          </div>

          {/* 右侧：保存按钮 */}
          <button
            onClick={handleSave}
            disabled={!name || !systemPrompt}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-2 border-content-primary',
              'bg-accent-hover text-content-primary font-mono text-xs font-bold uppercase',
              'shadow-hard-3',
              'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard',
              'active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-sm',
              'transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0'
            )}
          >
            {isEditMode ? <Save className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            <span>{isEditMode ? t('save') : t('create')}</span>
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 min-h-0 overflow-hidden pt-14">
        <div className="h-full max-w-7xl mx-auto flex">
          {/* 左侧：表单区 */}
          <div
            className="flex-1 min-h-0 overflow-y-auto bauhaus-scrollbar overscroll-behavior-y-contain p-6 md:p-8 pb-24 md:pb-20"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="max-w-xl mx-auto space-y-6">
              {/* 基本信息 - 两列布局 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 智能体名称 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-content-secondary"></div>
                    <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                      {t('agentName')} <span className="text-accent-hover">*</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('giveName')}
                    className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors"
                  />
                </div>

                {/* 分类选择 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-content-secondary"></div>
                    <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                      {t('category')}
                    </label>
                  </div>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors cursor-pointer"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 描述 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-content-secondary"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                    {t('description')}
                  </label>
                </div>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('simpleDescription')}
                  className="w-full px-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-accent-hover transition-colors"
                />
              </div>

              {/* 模型选择 */}
              <ModelSelector
                value={selectedModel}
                onChange={setSelectedModel}
                label="MODEL"
              />

              {/* 系统提示词 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-content-secondary"></div>
                    <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                      {t('systemPrompt')} <span className="text-accent-hover">*</span>
                    </label>
                  </div>
                  <span className="font-mono text-[10px] text-content-secondary opacity-60">
                    {systemPrompt.length}/2000
                  </span>
                </div>
                <p className="font-mono text-[10px] text-content-secondary opacity-60">
                  {t('defineBehavior')}
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value.slice(0, 2000))}
                  placeholder={t('systemPromptPlaceholder')}
                  rows={8}
                  maxLength={2000}
                  className="w-full px-3 py-3 border-2 border-border-default bg-surface-page font-mono text-sm leading-relaxed focus:outline-none focus:border-accent-hover transition-colors resize-none"
                />

                {/* Bauhaus 风格进度条 */}
                <BauhausProgressBar current={systemPrompt.length} max={2000} />
              </div>

              {/* 提示信息 */}
              <div className="p-4 border-2 border-accent-hover/50 bg-accent-hover/10">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-accent-hover mt-1.5 shrink-0"></div>
                  <p className="font-mono text-[10px] text-content-primary leading-relaxed">
                    <span className="font-bold">{t('tip')}: </span>
                    {t('tipDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：实时预览 */}
          <div className="hidden lg:flex lg:w-[400px] xl:w-[450px] border-l-2 border-border-default bg-surface-page/50">
            <div className="flex-1 overflow-y-auto bauhaus-scrollbar p-6">
              {/* 预览标题 */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2 h-2 bg-accent-hover"></div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                  /// {t('preview') || 'PREVIEW'}
                </span>
              </div>

              {/* 智能体卡片预览 */}
              <div className="border-2 border-border-default bg-surface-card p-5 shadow-hard-3">
                {/* 头像和名称 */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 border-2 border-border-default bg-accent-hover flex items-center justify-center">
                    <Bot className="w-7 h-7 text-content-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-mono text-sm font-bold text-content-primary truncate">
                      {name || t('unnamedAgent') || 'Unnamed Agent'}
                    </h3>
                    <span className="font-mono text-[10px] text-content-secondary uppercase">
                      {category}
                    </span>
                  </div>
                </div>

                {/* 描述 */}
                <p className="font-mono text-xs text-content-secondary mb-4 min-h-[40px]">
                  {description || t('noDescription') || 'No description provided'}
                </p>

                {/* 模型标签 */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="font-mono text-[10px] text-content-secondary uppercase">
                    MODEL:
                  </span>
                  <span className="font-mono text-[10px] px-2 py-1 border border-border-default bg-surface-page">
                    {selectedModel}
                  </span>
                </div>

                {/* 分隔线 */}
                <div className="h-0.5 bg-border-default mb-4"></div>

                {/* 系统提示词预览 */}
                <div className="space-y-2">
                  <span className="font-mono text-[10px] font-bold uppercase text-content-secondary">
                    {t('systemPrompt') || 'System Prompt'}
                  </span>
                  <div className="p-3 border border-border-default bg-surface-page min-h-[100px]">
                    <p className="font-mono text-[11px] text-content-secondary leading-relaxed line-clamp-6">
                      {systemPrompt || t('noSystemPrompt') || 'No system prompt configured'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 示例对话预览 */}
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-content-secondary"></div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                    /// {t('exampleChat') || 'EXAMPLE'}
                  </span>
                </div>

                <div className="space-y-3 opacity-60">
                  {/* 用户消息 */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 border border-border-default bg-surface-card shrink-0"></div>
                    <div className="flex-1 p-3 border border-border-default bg-surface-card">
                      <p className="font-mono text-[11px] text-content-secondary">
                        {t('exampleUserMessage') || 'Hello, can you help me?'}
                      </p>
                    </div>
                  </div>

                  {/* AI 回复 */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 border border-border-default bg-accent-hover shrink-0 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-content-primary" />
                    </div>
                    <div className="flex-1 p-3 border border-border-default bg-surface-card">
                      <p className="font-mono text-[11px] text-content-secondary">
                        {systemPrompt 
                          ? (t('exampleAiResponseWithPrompt') || 'I understand. I will respond according to my instructions.')
                          : (t('exampleAiResponseNoPrompt') || 'I am ready to help. Please provide a system prompt to define my behavior.')
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
