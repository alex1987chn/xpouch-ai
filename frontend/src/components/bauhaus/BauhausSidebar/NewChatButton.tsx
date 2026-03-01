/**
 * =============================
 * NewChatButton - 新建会话按钮
 * =============================
 */

import { MessageSquarePlus } from 'lucide-react'
import type { NewChatButtonProps } from './types'

export function NewChatButton({
  isCollapsed,
  isCreatingNewChat,
  onNewChat,
  t,
}: NewChatButtonProps) {
  return (
    <div className="pb-4 w-full flex justify-center" style={{ maxWidth: '230px' }}>
      {isCollapsed ? (
        <div className="flex justify-center">
          <button
            onClick={onNewChat}
            disabled={isCreatingNewChat}
            className="w-9 h-9 rounded-full border-2 border-[rgb(var(--border-default))] bg-[rgb(var(--surface-card))] text-[rgb(var(--content-primary))] shadow-[rgb(var(--shadow-color))_4px_4px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[rgb(var(--accent-hover))_6px_6px_0_0] hover:bg-[rgb(var(--accent-hover))] hover:text-content-primary hover:border-content-primary active:translate-x-[2px] active:translate-y-[2px] active:shadow-none relative group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[rgb(var(--shadow-color))_4px_4px_0_0]"
            title={t('newChat')}
          >
            <MessageSquarePlus className="w-4 h-4 relative z-10" />
          </button>
        </div>
      ) : (
        <button
          onClick={onNewChat}
          disabled={isCreatingNewChat}
          className="w-[230px] h-[60px] rounded-lg flex items-center justify-center gap-2 border-2 border-[rgb(var(--border-default))] bg-[rgb(var(--surface-card))] text-[rgb(var(--content-primary))] shadow-[rgb(var(--shadow-color))_4px_4px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[rgb(var(--accent-hover))_6px_6px_0_0] hover:bg-[rgb(var(--accent-hover))] hover:text-content-primary hover:border-content-primary active:translate-x-[2px] active:translate-y-[2px] active:shadow-none relative group px-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[rgb(var(--shadow-color))_4px_4px_0_0]"
        >
          <div className="absolute top-0 right-0 w-4 h-4 bg-[rgb(var(--border-default))] transition-all group-hover:w-full group-hover:h-full group-hover:bg-[rgb(var(--accent-hover))] -z-10" />
          <MessageSquarePlus className="w-4 h-4 relative z-10" />
          <span className="relative z-10 group-hover:text-content-primary">{t('newChat')}</span>
        </button>
      )}
    </div>
  )
}
