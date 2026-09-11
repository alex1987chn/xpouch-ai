/**
 * 空状态组件 - 统一版本
 * 支持两种变体：compact（聊天区域）和 detailed（Artifact 区域）
 */

import { Sparkles, LayoutGrid } from 'lucide-react'
import { useTranslation } from '@/i18n'

interface EmptyStateProps {
  /** 变体类型：compact 用于聊天，detailed 用于 Artifact 区域 */
  variant?: 'compact' | 'detailed'
  /** 自定义标题（detailed 变体有效） */
  title?: string
  /** 自定义描述（detailed 变体有效） */
  description?: string
}

export default function EmptyState({
  variant = 'compact',
  title,
  description
}: EmptyStateProps) {
  const { t } = useTranslation()

  // Compact 变体：用于聊天区域，简洁风格（蓝本首跑空态：几何口袋 + 引导文案）
  if (variant === 'compact') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[50%_50%_50%_0] bg-accent-brand mb-4">
          <Sparkles className="h-6 w-6 text-accent-ink" />
        </div>
        <p className="text-sm text-content-muted">
          {t('initConversation')}
        </p>
      </div>
    )
  }

  // Detailed 变体：用于 Artifact 区域，更丰富的视觉
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 border-theme-card border-dashed border-border/30 bg-panel/50 rounded-lg">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-lg border-theme-card border-border bg-card shadow-theme-card flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-bold tracking-wide text-primary">
            {title || t('noArtifacts')}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {description || '等待专家生成交付物。任务进行时，交付物将显示在这里。'}
          </p>
        </div>
        <div className="flex justify-center gap-2 pt-4">
          <div className="h-2 w-2 rounded-full bg-border/30" />
          <div className="h-2 w-2 rounded-full bg-border/50" />
          <div className="h-2 w-2 rounded-full bg-accent" />
          <div className="h-2 w-2 rounded-full bg-border/50" />
          <div className="h-2 w-2 rounded-full bg-border/30" />
        </div>
        <div className="pt-4 border-t border-border/20">
          <div className="text-nano text-muted-foreground/70">
            {t('workbenchNewHint')}
          </div>
        </div>
      </div>
    </div>
  )
}
