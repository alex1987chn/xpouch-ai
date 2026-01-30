import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Save, Info, X, Check } from 'lucide-react'
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
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  // 加载智能体 prompt
  useEffect(() => {
    if (isOpen) {
      const prompts: Record<string, string> = {}
      agents.forEach(agent => {
        const config = getAgentPrompt(agent.id)
        if (config && config.enabled) {
          prompts[agent.id] = config.prompt
        }
      })
      setAgentPrompts(prompts)
      setSelectedModelId(getDefaultModel())
    }
  }, [isOpen])

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

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="relative bg-[var(--bg-card)] border-2 border-[var(--border-color)] shadow-[var(--shadow-color)_8px_8px_0_0] w-[600px] max-w-[90vw] max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - Bauhaus风格 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              /// SYSTEM_CONFIG
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto bauhaus-scrollbar px-5 py-5 space-y-6">
          {/* 默认模型选择 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                DEFAULT_MODEL
              </span>
            </div>

            <div className="space-y-2">
              {AVAILABLE_MODELS.map(model => (
                <div
                  key={model.id}
                  onClick={() => setSelectedModelId(model.id)}
                  className={cn(
                    'flex items-center gap-3 p-3 border-2 cursor-pointer transition-all',
                    selectedModelId === model.id
                      ? 'border-[var(--accent-hover)] bg-[var(--accent-hover)]/10'
                      : 'border-[var(--border-color)] hover:border-[var(--text-secondary)]'
                  )}
                >
                  <div className="flex-1">
                    <div className="font-mono text-sm font-bold text-[var(--text-primary)]">
                      {model.name}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-secondary)] mt-0.5">
                      {model.description}
                    </div>
                  </div>
                  {selectedModelId === model.id && (
                    <div className="w-5 h-5 border-2 border-[var(--accent-hover)] bg-[var(--accent-hover)] flex items-center justify-center">
                      <Check className="w-3 h-3 text-black" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 分隔线 */}
          <div className="border-t-2 border-[var(--border-color)]"></div>

          {/* API Key 配置说明 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                API_KEY_CONFIG
              </span>
            </div>

            <div className="p-3 border-2 border-blue-500/50 bg-blue-500/10">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-mono text-xs font-bold text-[var(--text-primary)] mb-1">
                    API Key 配置说明
                  </h4>
                  <p className="font-mono text-[10px] text-[var(--text-secondary)] mb-1">
                    所有 API Key 均通过服务端环境变量配置，以确保安全性。
                  </p>
                  <p className="font-mono text-[9px] text-[var(--text-secondary)] opacity-60">
                    请在服务器上配置 .env 文件中的 DEEPSEEK_API_KEY、OPENAI_API_KEY、ANTHROPIC_API_KEY、GOOGLE_API_KEY
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 分隔线 */}
          <div className="border-t-2 border-[var(--border-color)]"></div>

          {/* 智能体 Prompt 配置 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                AGENT_PROMPTS
              </span>
            </div>

            <div className="space-y-2">
              {agents.map(agent => {
                const defaultPrompt = getAgentDefaultPrompt(agent.id)
                const customPrompt = agentPrompts[agent.id] || ''
                const isExpanded = expandedAgent === agent.id

                return (
                  <div
                    key={agent.id}
                    className="border-2 border-[var(--border-color)] overflow-hidden"
                  >
                    {/* 智能体头部 - 可点击展开 */}
                    <div
                      onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--bg-page)] transition-colors"
                    >
                      <div
                        className="w-10 h-10 border-2 border-[var(--border-color)] flex items-center justify-center shrink-0"
                        style={{ background: agent.color.includes('from-') ? `linear-gradient(135deg, var(--tw-gradient-stops))` : agent.color }}
                      >
                        <span className="text-white text-lg font-black">{agent.name[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm font-bold text-[var(--text-primary)]">
                          {agent.name}
                        </div>
                        <p className="font-mono text-[9px] text-[var(--text-secondary)] truncate">
                          {customPrompt ? '已自定义' : `默认: ${defaultPrompt.substring(0, 30)}...`}
                        </p>
                      </div>
                      <div className={cn(
                        "transition-transform duration-200",
                        isExpanded && "rotate-90"
                      )}>
                        <span className="font-mono text-lg text-[var(--text-secondary)]">›</span>
                      </div>
                    </div>

                    {/* 展开的 Prompt 编辑区域 */}
                    {isExpanded && (
                      <div className="border-t-2 border-[var(--border-color)] p-3 bg-[var(--bg-page)]">
                        <textarea
                          value={customPrompt}
                          onChange={(e) => handlePromptChange(agent.id, e.target.value)}
                          placeholder={`使用默认 prompt: ${defaultPrompt}`}
                          rows={4}
                          className="w-full px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] font-mono text-xs focus:outline-none focus:border-[var(--accent-hover)] transition-colors resize-none"
                        />
                        <div className="flex justify-between items-center mt-2">
                          <span className="font-mono text-[9px] text-[var(--text-secondary)]">
                            {customPrompt.length} 字符
                          </span>
                          {customPrompt && (
                            <button
                              onClick={() => handlePromptChange(agent.id, '')}
                              className="font-mono text-[9px] text-red-500 hover:underline"
                            >
                              重置为默认
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-0 border-t-2 border-[var(--border-color)] shrink-0">
          <button
            onClick={handleClose}
            className="flex-1 py-3 font-mono text-sm font-bold uppercase border-r-2 border-[var(--border-color)] hover:bg-[var(--bg-page)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-[var(--accent-hover)] text-black font-mono text-sm font-bold uppercase hover:brightness-95 transition-colors"
          >
            <span className="flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              保存设置
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
