import { useState } from 'react'
import { ArrowLeft, Bot, Sparkles, Check } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { cn } from '@/lib/utils'
import SwipeBackIndicator from './SwipeBackIndicator'
import AgentPreviewCard from './AgentPreviewCard'
import { models } from '@/config/models'

interface CreateAgentPageProps {
  onBack: () => void
  onSave: (agent: any) => void
}

// Bauhaus 风格进度条组件
function BauhausProgressBar({ current, max }: { current: number; max: number }) {
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
                'w-3 h-4 border border-[var(--border-color)] transition-all duration-200',
                isFilled
                  ? 'bg-[var(--accent-hover)]'
                  : 'bg-[var(--bg-page)]'
              )}
            />
          )
        })}
      </div>

      {/* 字数统计 */}
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-[var(--text-secondary)]">
          {current} / {max} CHARS
        </span>
        <span className={cn(
          'font-bold uppercase',
          progress >= 1
            ? 'text-green-600'
            : progress >= 0.8
              ? 'text-[var(--accent-hover)]'
              : 'text-[var(--text-secondary)]'
        )}>
          {progress >= 1 ? 'COMPLETE' : progress >= 0.8 ? 'ALMOST' : 'INPUT...'}
        </span>
      </div>
    </div>
  )
}

export default function CreateAgentPage({ onBack, onSave }: CreateAgentPageProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [category, setCategory] = useState('综合')
  const [selectedModel, setSelectedModel] = useState('deepseek-chat')

  const { swipeProgress, handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({
    enabled: true,
    onSwipe: onBack
  })

  const handleSave = () => {
    if (!name || !systemPrompt) return

    const newAgent = {
      id: `user-agent-${Date.now()}`,
      name,
      description,
      systemPrompt,
      category,
      modelId: selectedModel,
      icon: <Bot className="w-5 h-5" />,
      color: 'from-violet-500 to-fuchsia-500'
    }

    onSave(newAgent)
  }

  const categories = ['综合', '开发', '创作', '分析', '研究']

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 移动端滑动返回指示器 */}
      <SwipeBackIndicator swipeProgress={swipeProgress} />

      {/* 顶部 Bauhaus Header */}
      <header className="sticky top-0 z-40 w-full h-14 px-6 border-b-2 border-[var(--border-color)] bg-[var(--bg-card)] shrink-0">
        <div className="w-full max-w-7xl mx-auto h-full flex items-center justify-between">
          {/* 左侧：返回按钮 */}
          <button
            onClick={onBack}
            className="flex items-center justify-center w-9 h-9 border-2 border-[var(--border-color)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* 标题 */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              /// CREATE_AGENT
            </span>
          </div>

          {/* 右侧：创建按钮 */}
          <button
            onClick={handleSave}
            disabled={!name || !systemPrompt}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-2 border-[var(--border-color)]',
              'bg-[var(--accent-hover)] text-black font-mono text-xs font-bold uppercase',
              'shadow-[var(--shadow-color)_3px_3px_0_0]',
              'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_4px_4px_0_0]',
              'active:translate-x-[0px] active:translate-y-[0px] active:shadow-none',
              'transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:shadow-[var(--shadow-color)_3px_3px_0_0]'
            )}
          >
            <Sparkles className="w-4 h-4" />
            <span>{t('create')}</span>
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
                  <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                    AGENT_NAME <span className="text-[var(--accent-hover)]">*</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="给你的智能体起个名字..."
                  className="w-full px-4 py-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
                />
              </div>

              {/* 分类选择 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                    CATEGORY
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
                          ? 'border-[var(--accent-hover)] bg-[var(--accent-hover)] text-black shadow-[var(--shadow-color)_2px_2px_0_0]'
                          : 'border-[var(--border-color)] bg-[var(--bg-page)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 模型选择 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                    MODEL
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={cn(
                        'px-4 py-2 border-2 font-mono text-xs font-bold uppercase transition-all',
                        selectedModel === model.id
                          ? 'border-[var(--accent-hover)] bg-[var(--accent-hover)] text-black shadow-[var(--shadow-color)_2px_2px_0_0]'
                          : 'border-[var(--border-color)] bg-[var(--bg-page)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                      )}
                    >
                      {model.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 描述 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                    DESCRIPTION
                  </label>
                </div>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('simpleDescription')}
                  className="w-full px-4 py-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
                />
              </div>

              {/* 系统提示词 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                    SYSTEM_PROMPT <span className="text-[var(--accent-hover)]">*</span>
                  </label>
                </div>
                <p className="font-mono text-[10px] text-[var(--text-secondary)] opacity-60">
                  {t('defineBehavior')}
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value.slice(0, 2000))}
                  placeholder={t('writingAssistantPlaceholder')}
                  rows={10}
                  maxLength={2000}
                  className="w-full px-4 py-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm leading-relaxed focus:outline-none focus:border-[var(--accent-hover)] transition-colors resize-none"
                />

                {/* Bauhaus 风格进度条 */}
                <BauhausProgressBar current={systemPrompt.length} max={2000} />
              </div>

              {/* 提示信息 */}
              <div className="p-4 border-2 border-[var(--accent-hover)]/50 bg-[var(--accent-hover)]/10">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-[var(--accent-hover)] mt-1.5 shrink-0"></div>
                  <p className="font-mono text-[10px] text-[var(--text-primary)] leading-relaxed">
                    <span className="font-bold">{t('tip')}：</span>
                    {t('tipDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：实时预览区 - Sticky */}
          <div className="hidden lg:block w-96 flex-shrink-0 p-6">
            <div className="sticky top-24">
              {/* 预览标题 */}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 bg-[var(--accent-hover)]"></div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                  /// PREVIEW
                </span>
              </div>

              {/* 预览卡片 */}
              <div className="space-y-3">
                <AgentPreviewCard
                  name={name}
                  description={description}
                  category={category}
                />
              </div>

              {/* 预览说明 */}
              <p className="mt-4 font-mono text-[10px] text-[var(--text-secondary)] text-center opacity-60">
                {t('previewDescription')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
