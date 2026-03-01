/**
 * =============================
 * NewChatButton - 新建会话按钮
 * =============================
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
            'flex items-center justify-center gap-2 border-2 border-border bg-surface-card text-content-primary',
            'shadow-hard hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-hard-accent-md',
            'hover:bg-accent-hover hover:text-content-primary hover:border-content-primary',
            'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
            'relative group px-2 disabled:opacity-50 disabled:cursor-not-allowed',
            'disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-hard',
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
