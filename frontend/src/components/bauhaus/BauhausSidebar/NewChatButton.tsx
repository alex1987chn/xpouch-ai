/**
 * =============================
 * NewChatButton - 新建会话按钮
 * =============================
 * 
 * 使用语义化 CSS 变量，完全主题自适应
 */

import { MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { collapsedButtonStyles } from './NavigationMenu'
import { TW } from './constants'

import type { NewChatButtonProps } from './types'

export function NewChatButton({
  isCollapsed,
  isCreatingNewChat,
  onNewChat,
  t,
}: NewChatButtonProps) {
  return (
    <div className={cn('pb-4 w-full flex justify-center', 'max-w-[230px]')}>
      {isCollapsed ? (
        <div className="flex justify-center">
          <button
            onClick={onNewChat}
            disabled={isCreatingNewChat}
            className={collapsedButtonStyles(false)}
            title={t('newChat')}
          >
            <MessageSquarePlus className="w-4 h-4 relative z-10" />
          </button>
        </div>
      ) : (
        <button
          onClick={onNewChat}
          disabled={isCreatingNewChat}
          className={cn(
            'flex items-center justify-center gap-2 border-2 border-border-default bg-surface-card text-content-primary',
            'shadow-theme-button-lg hover:[transform:var(--transform-button-lg-hover)] hover:shadow-theme-button-lg-hover',
            'hover:bg-accent-hover hover:text-content-primary hover:border-border-focus',
            'active:[transform:var(--transform-button-active)] active:shadow-theme-button-active',
            'relative group px-2 disabled:opacity-50 disabled:cursor-not-allowed',
            'disabled:hover:[transform:none] disabled:hover:shadow-theme-button-lg',
            TW.BUTTON_WIDTH, TW.BUTTON_HEIGHT_LARGE
          )}
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span className="group-hover:text-content-primary">{t('newChat')}</span>
        </button>
      )}
    </div>
  )
}
