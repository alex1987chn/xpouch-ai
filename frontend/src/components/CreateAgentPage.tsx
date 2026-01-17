import { useState } from 'react'
import { ArrowLeft, Bot, Save } from 'lucide-react'
import { useTranslation } from '@/i18n'

interface CreateAgentPageProps {
  onBack: () => void
  onSave: (agent: any) => void
}

export default function CreateAgentPage({ onBack, onSave }: CreateAgentPageProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  const handleSave = () => {
    if (!name || !systemPrompt) return

    const newAgent = {
      id: `user-agent-${Date.now()}`,
      name,
      description,
      systemPrompt,
      category: 'user',
      modelId: 'gpt-4o'
    }

    onSave(newAgent)
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 h-16 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 justify-between bg-white dark:bg-gray-900 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('createAgent')}
            </h1>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!name || !systemPrompt}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          <span>{t('create')}</span>
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Agent Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('agentName')} <span className="text-red-500">{t('required')}</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agentNamePlaceholder')}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('description')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow"
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('systemPrompt')} <span className="text-red-500">{t('required')}</span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {t('systemPromptHint')}
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('systemPromptPlaceholder')}
              rows={8}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow resize-none font-mono text-sm"
            />
          </div>

        </div>
      </div>
    </div>
  )
}
