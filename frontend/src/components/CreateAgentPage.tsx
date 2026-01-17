import { useState } from 'react'
import { ArrowLeft, Bot, Sparkles } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { cn } from '@/lib/utils'

interface CreateAgentPageProps {
  onBack: () => void
  onSave: (agent: any) => void
}

// 预览卡片组件（复用首页卡片样式）
function PreviewCard({ name, description, category }: { name: string; description: string; category: string }) {
  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden',
        'bg-white dark:bg-slate-900/50',
        'rounded-2xl border border-slate-200/50 dark:border-slate-700/50',
        'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-1 hover:shadow-xl'
      )}
    >
      {/* 左侧渐变竖条 - 悬停时显示 */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-blue-400 to-violet-500',
          'transition-all duration-300 ease-out',
          'opacity-0 group-hover:opacity-100'
        )}
      />

      <div className="p-5 pl-5">
        <div className="flex items-start gap-3">
          {/* 图标容器 */}
          <div
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
              'bg-gradient-to-br from-violet-500 to-fuchsia-500',
              'transition-all duration-300 ease-out',
              'group-hover:scale-110'
            )}
          >
            <Bot className="w-5 h-5 text-white" />
          </div>

          {/* 标题与标签 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate text-sm leading-tight">
                {name || '未命名智能体'}
              </h3>
              <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {category || '综合'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
              {description || '点击编辑智能体描述...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// 像素风格进度条组件
function PixelProgressBar({ current, max }: { current: number; max: number }) {
  const progress = Math.min(current / max, 1)
  const pixelCount = 16 // 像素块数量
  const filledCount = Math.floor(progress * pixelCount)

  return (
    <div className="space-y-2">
      {/* 像素进度条 */}
      <div className="flex items-center gap-1">
        {/* 已填充的像素块 */}
        {Array.from({ length: pixelCount }).map((_, i) => {
          const isFilled = i < filledCount
          const delay = i * 0.02

          return (
            <div
              key={i}
              className={cn(
                'w-4 h-2 rounded-[2px] transition-all duration-300',
                isFilled
                  ? 'bg-gradient-to-r from-blue-400 via-indigo-500 to-violet-500'
                  : 'bg-slate-200 dark:bg-slate-700'
              )}
              style={{
                opacity: isFilled ? 1 : undefined,
                animationDelay: `${delay}s`
              }}
            />
          )
        })}
      </div>

      {/* 字数统计 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {current} / {max} 字
        </span>
        <span className={cn(
          'text-xs font-medium transition-colors duration-300',
          progress >= 1
            ? 'text-green-500'
            : progress >= 0.8
              ? 'text-violet-500'
              : 'text-slate-400 dark:text-slate-500'
        )}>
          {progress >= 1 ? '已满' : progress >= 0.8 ? '快完成了' : '继续输入...'}
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
      modelId: 'gpt-4o',
      icon: <Bot className="w-5 h-5" />,
      color: 'from-violet-500 to-fuchsia-500'
    }

    onSave(newAgent)
  }

  const categories = ['综合', '开发', '创作', '分析', '研究']

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 移动端滑动返回指示器 */}
      {swipeProgress > 0 && (
        <div
          className="md:hidden absolute left-0 top-0 bottom-0 flex items-center justify-center bg-gradient-to-r from-indigo-500/30 to-transparent backdrop-blur-sm pointer-events-none z-50 transition-all"
          style={{ width: `${Math.min(swipeProgress, 150)}px` }}
        >
          <ArrowLeft className="w-8 h-8 text-indigo-600 ml-3 opacity-90" />
        </div>
      )}

      {/* 顶部毛玻璃 Header */}
      <header className="sticky top-0 z-40 w-full h-14 px-6 backdrop-blur-xl bg-white/70 dark:bg-[#020617]/70 border-b border-slate-200/50 dark:border-slate-700/30 shrink-0">
        <div className="w-full max-w-7xl mx-auto h-full flex items-center justify-between">
          {/* 左侧：返回按钮 */}
          <button
            onClick={onBack}
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>

          {/* 标题 */}
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-200">
            {t('createAgent')}
          </h1>

          {/* 右侧：创建按钮 - 品牌渐变 + Glow 效果 */}
          <button
            onClick={handleSave}
            disabled={!name || !systemPrompt}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-full',
              'bg-gradient-to-r from-blue-500 to-violet-500',
              'text-white text-sm font-medium',
              'transition-all duration-300',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'hover:shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:scale-105',
              'active:scale-95'
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
            className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-behavior-y-contain p-6 md:p-12 pb-24 md:pb-20"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="max-w-xl mx-auto space-y-8">
              {/* 智能体名称 */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>智能体名称</span>
                  <span className="text-violet-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="给你的智能体起个名字..."
                  className={cn(
                    'w-full px-5 py-3.5 rounded-2xl',
                    'bg-white dark:bg-slate-800/50',
                    'border border-slate-200/50 dark:border-slate-700/50',
                    'text-slate-800 dark:text-slate-100',
                    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                    'focus:outline-none focus:border-transparent',
                    'transition-all duration-300',
                    'focus:ring-2 focus:ring-violet-500/50'
                  )}
                />
              </div>

              {/* 分类选择 */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>分类</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'px-4 py-2 rounded-full text-sm font-medium transition-all duration-300',
                        category === cat
                          ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 描述 */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>描述</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简单描述你的智能体..."
                  className={cn(
                    'w-full px-5 py-3.5 rounded-2xl',
                    'bg-white dark:bg-slate-800/50',
                    'border border-slate-200/50 dark:border-slate-700/50',
                    'text-slate-800 dark:text-slate-100',
                    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                    'focus:outline-none focus:border-transparent',
                    'transition-all duration-300',
                    'focus:ring-2 focus:ring-violet-500/50'
                  )}
                />
              </div>

              {/* 系统提示词 */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>系统提示词</span>
                  <span className="text-violet-500">*</span>
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  定义智能体的行为、性格和能力
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value.slice(0, 2000))}
                  placeholder="你是一个专业的写作助手..."
                  rows={10}
                  maxLength={2000}
                  className={cn(
                    'w-full px-5 py-4 rounded-2xl scrollbar-thin',
                    'bg-white dark:bg-slate-800/50',
                    'border border-slate-200/50 dark:border-slate-700/50',
                    'text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500',
                    'focus:outline-none focus:border-transparent',
                    'transition-all duration-300 resize-none',
                    'focus:ring-2 focus:ring-violet-500/50',
                    'font-mono text-sm leading-relaxed'
                  )}
                />

                {/* 像素风格进度条 */}
                <PixelProgressBar current={systemPrompt.length} max={2000} />
              </div>

              {/* 提示信息 */}
              <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200/50 dark:border-violet-700/50">
                <p className="text-xs text-violet-600 dark:text-violet-300">
                  <span className="font-semibold">提示：</span>
                  填写名称和系统提示词后即可创建智能体。详细的提示词能让智能体更好地理解你的需求。
                </p>
              </div>
            </div>
          </div>

          {/* 右侧：实时预览区 - Sticky */}
          <div className="hidden lg:block w-96 flex-shrink-0 p-6">
            <div className="sticky top-24">
              {/* 预览标题 */}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-blue-400 to-violet-500" />
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  实时预览
                </h2>
              </div>

              {/* 预览卡片 */}
              <div className="space-y-3">
                <PreviewCard
                  name={name}
                  description={description}
                  category={category}
                />
              </div>

              {/* 预览说明 */}
              <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 text-center">
                这是你的智能体在首页展示的效果
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
