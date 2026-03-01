import { useState } from 'react'
import { ArrowLeft, Bot, Sparkles, Save } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import { useTaskStore } from '@/store/taskStore'
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
                  ? 'bg-[rgb(var(--accent-hover))]'
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
              ? 'text-[rgb(var(--accent-hover))]'
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
      <header className="sticky top-0 z-40 w-full h-14 px-6 border-b-2 border-border-default bg-surface-card shrink-0">
        <div className="w-full max-w-7xl mx-auto h-full flex items-center justify-between">
          {/* 左侧：返回按钮 */}
          <button
            onClick={onBack}
            className="flex items-center justify-center w-9 h-9 border-2 border-border-default hover:bg-[rgb(var(--accent-hover))] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* 标题 */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[rgb(var(--accent-hover))]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {isEditMode ? t('editAgent') : t('createAgent')}
            </span>
          </div>

          {/* 右侧：保存按钮 */}
          <button
            onClick={handleSave}
            disabled={!name || !systemPrompt}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-2 border-black',
              'bg-[rgb(var(--accent-hover))] text-black font-mono text-xs font-bold uppercase',
              'shadow-[3px_3px_0_0_rgba(0,0,0,1)]',
              'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)]',
              'active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_rgba(0,0,0,1)]',
              'transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0'
            )}
          >
            {isEditMode ? <Save className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            <span>{isEditMode ? t('save') : t('create')}</span>
          </button>
        </div>
      </header>

      {/* 主内容区 - 双栏布局 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto flex">
          {/* 左侧：表单区 */}
          <div
            className="flex-1 min-h-0 overflow-y-auto bauhaus-scrollbar overscroll-behavior-y-contain p-6 md:p-12 pb-24 md:pb-20"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="max-w-xl mx-auto space-y-8">
              {/* 智能体名称 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                    {t('agentName')} <span className="text-[rgb(var(--accent-hover))]">*</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('giveName')}
                  className="w-full px-4 py-3 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-[rgb(var(--accent-hover))] transition-colors"
                />
              </div>

              {/* 分类选择 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                    {t('category')}
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'px-4 py-2 border-2 font-mono text-xs font-bold uppercase transition-all',
                        category === cat
                          ? 'border-[rgb(var(--accent-hover))] bg-[rgb(var(--accent-hover))] text-black shadow-[rgb(var(--shadow-color))_2px_2px_0_0]'
                          : 'border-border-default bg-surface-page text-content-secondary hover:border-[rgb(var(--content-secondary))]'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 模型选择 - 使用可复用组件 */}
              <ModelSelector
                value={selectedModel}
                onChange={setSelectedModel}
                label="MODEL"
              />

              {/* 描述 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                    {t('description')}
                  </label>
                </div>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('simpleDescription')}
                  className="w-full px-4 py-3 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-[rgb(var(--accent-hover))] transition-colors"
                />
              </div>

              {/* 系统提示词 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[rgb(var(--content-secondary))]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                    {t('systemPrompt')} <span className="text-[rgb(var(--accent-hover))]">*</span>
                  </label>
                </div>
                <p className="font-mono text-[10px] text-content-secondary opacity-60">
                  {t('defineBehavior')}
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value.slice(0, 2000))}
                  placeholder={t('writingAssistantPlaceholder')}
                  rows={10}
                  maxLength={2000}
                  className="w-full px-4 py-3 border-2 border-border-default bg-surface-page font-mono text-sm leading-relaxed focus:outline-none focus:border-[rgb(var(--accent-hover))] transition-colors resize-none"
                />

                {/* Bauhaus 风格进度条 */}
                <BauhausProgressBar current={systemPrompt.length} max={2000} />
              </div>

              {/* 提示信息 */}
              <div className="p-4 border-2 border-[rgb(var(--accent-hover))]/50 bg-[rgb(var(--accent-hover))]/10">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-[rgb(var(--accent-hover))] mt-1.5 shrink-0"></div>
                  <p className="font-mono text-[10px] text-content-primary leading-relaxed">
                    <span className="font-bold">{t('tip')}: </span>
                    {t('tipDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
