/**
 * 思考区域组件
 * 可展开/收起的思考过程展示
 */

import { useState } from 'react'
import { Brain, ChevronUp, ChevronDown, Check, X } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { ThinkingSectionProps } from '../types'
import { translateExpertName } from '../utils'

export default function ThinkingSection({ thinking }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { t } = useTranslation()

  const completedSteps = thinking.filter(s => s.status === 'completed').length

  return (
    <div className="mb-4 border border-border bg-panel">
      {/* 头部 - 点击展开/收起 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-primary/80 hover:text-primary transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-[var(--accent-hover)]" />
          <span className="font-bold">{t('thinking')}</span>
          <span className="text-[10px] text-primary/60">
            ({completedSteps}/{thinking.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {thinking.some(s => s.status === 'running') && (
            <div className="w-1.5 h-1.5 bg-[var(--accent-hover)] rounded-full animate-pulse" />
          )}
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="border-t border-border px-3 py-2 space-y-2 max-h-60 overflow-y-auto">
          {thinking.map((step, index) => (
            <div key={step.id} className="text-xs font-mono">
              <div className="flex items-center gap-2 text-[10px] text-primary/70 mb-1">
                <span className="text-[var(--accent-hover)] font-bold">[{index + 1}]</span>
                <span className="font-semibold">{translateExpertName(step.expertName, t)}</span>
                {step.status === 'running' && <span className="text-[var(--accent-hover)] animate-pulse">...</span>}
                {step.status === 'completed' && <Check className="w-3 h-3 text-green-600 dark:text-green-400" />}
                {step.status === 'failed' && <X className="w-3 h-3 text-red-600 dark:text-red-400" />}
              </div>
              <div className="pl-4 text-primary/80 whitespace-pre-wrap">
                {step.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
