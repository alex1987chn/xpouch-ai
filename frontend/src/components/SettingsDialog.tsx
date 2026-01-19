import { useState } from 'react'
import { X, Save, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AVAILABLE_MODELS, getDefaultModel, setDefaultModel, getAgentPrompt, setAgentPrompt, getAgentDefaultPrompt } from '@/utils/config'
import { agents } from '@/data/agents'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>(getDefaultModel())
  const [agentPrompts, setAgentPrompts] = useState<Record<string, string>>({})

  // 加载智能体 prompt
  useState(() => {
    const prompts: Record<string, string> = {}
    agents.forEach(agent => {
      const config = getAgentPrompt(agent.id)
      if (config && config.enabled) {
        prompts[agent.id] = config.prompt
      }
    })
    setAgentPrompts(prompts)
  })

  const handleSave = () => {
    setDefaultModel(selectedModelId)
    Object.entries(agentPrompts).forEach(([agentId, prompt]) => {
      if (prompt.trim()) {
        setAgentPrompt(agentId, prompt)
      }
    })
    onClose()
  }

  const handlePromptChange = (agentId: string, value: string) => {
    setAgentPrompts(prev => ({ ...prev, [agentId]: value }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative bg-card rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">
            系统设置
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto smooth-scroll px-6 py-4 space-y-6">
          {/* 默认模型选择 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              默认模型
            </h3>
            <div className="space-y-2">
              {AVAILABLE_MODELS.map(model => (
                <label
                  key={model.id}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                    selectedModelId === model.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'border-border hover:border-input'
                  )}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={selectedModelId === model.id}
                    onChange={() => setSelectedModelId(model.id)}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {model.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {model.description}
                    </div>
                  </div>
                  {selectedModelId === model.id && (
                    <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </label>
              ))}
            </div>
          </section>

          {/* API Key 配置说明 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              API Key 配置
            </h3>
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-foreground mb-1">
                    API Key 配置说明
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    所有 API Key 均通过服务端环境变量配置，以确保安全性。
                  </p>
                  <p className="text-xs text-muted-foreground">
                    请在服务器上配置 .env 文件中的 DEEPSEEK_API_KEY、OPENAI_API_KEY、ANTHROPIC_API_KEY、GOOGLE_API_KEY
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 智能体 Prompt 配置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              智能体 Prompt 配置
            </h3>
            <div className="space-y-4">
              {agents.map(agent => {
                const defaultPrompt = getAgentDefaultPrompt(agent.id)
                const customPrompt = agentPrompts[agent.id] || ''

                return (
                  <div key={agent.id} className="p-4 rounded-xl border border-border bg-secondary/30">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: `linear-gradient(to bottom right, ${agent.color.replace('from-', 'var(--tw-gradient-stops):').replace('to-', ',')}` }}
                      >
                        <span className="text-white text-lg">{agent.name[0]}</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground">
                          {agent.name}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {defaultPrompt.substring(0, 50)}...
                        </p>
                      </div>
                    </div>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => handlePromptChange(agent.id, e.target.value)}
                      placeholder={`使用默认 prompt: ${defaultPrompt}`}
                      rows={3}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-secondary/30">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            保存设置
          </button>
        </div>
      </div>
    </div>
  )
}
