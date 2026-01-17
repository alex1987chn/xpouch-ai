import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CreateAgentFormProps {
  onSave: (agent: any) => void
  onCancel: () => void
}

/**
 * 创建智能体表单组件
 */
export default function CreateAgentForm({ onSave, onCancel }: CreateAgentFormProps) {
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('综合')
  const [systemPrompt, setSystemPrompt] = useState('')

  const handleSave = () => {
    if (name.trim() && description.trim()) {
      onSave({
        id: `custom-${Date.now()}`,
        name: name.trim(),
        description: description.trim(),
        category,
        systemPrompt: systemPrompt.trim() || description.trim(),
        isCustom: true
      })
    }
  }

  const isFormValid = name.trim() && description.trim()
  const promptLength = systemPrompt.length
  const maxLength = 2000

  const categories = ['综合', '开发', '创作', '分析', '研究']

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 md:p-8 shadow-sm">
          {/* 表单标题 */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
              配置专属智能体
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              创建属于你自己的 AI 助手，定制化能力与风格
            </p>
          </div>

          {/* 智能体名称 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
              智能体名称
            </label>
            <Input
              value={name}
              onChange={setName}
              placeholder="例如：文案专家、代码助手"
              className="bg-white dark:bg-slate-800/50"
            />
          </div>

          {/* 分类选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
              分类
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium transition-all',
                    category === cat
                      ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-lg'
                      : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 智能体描述 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
              智能体描述
            </label>
            <Input
              value={description}
              onChange={setDescription}
              placeholder="描述智能体的功能与特点"
              className="bg-white dark:bg-slate-800/50"
            />
          </div>

          {/* 系统提示词 */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                系统提示词
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {promptLength}/{maxLength}
              </span>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="为智能体设定角色定位与行为模式（默认为描述内容）"
              maxLength={maxLength}
              className="w-full h-32 p-4 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 focus:ring-2 focus:ring-violet-500/50 outline-none resize-none text-sm text-slate-800 dark:text-slate-100"
            />
            {/* 像素风格进度条 */}
            <div className="flex gap-1 mt-3">
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-full h-2 rounded-sm transition-all duration-300',
                    i < Math.floor((promptLength / maxLength) * 16)
                      ? 'bg-gradient-to-r from-violet-500 to-blue-500'
                      : 'bg-slate-200 dark:bg-slate-700'
                  )}
                />
              ))}
            </div>
          </div>

          {/* 按钮组 */}
          <div className="flex gap-4">
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isFormValid}
              className={cn(
                'flex-1',
                !isFormValid && 'opacity-50 cursor-not-allowed'
              )}
            >
              创建智能体
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
