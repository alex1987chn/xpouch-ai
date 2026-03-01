/**
 * =============================
 * RecentConversations - 最近会话列表
 * =============================
 */

import { DIMENSIONS } from '@/constants/ui'
import type { RecentConversationsProps } from './types'

export function RecentConversations({
  conversations,
  onConversationClick,
  formatRelativeTime,
  t,
}: RecentConversationsProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col py-4 overflow-hidden w-full">
      {/* 小标题: 模拟终端注释 - 左对齐 */}
      <div className="px-4 mb-2 flex items-center gap-2 opacity-50 mx-auto" style={{ width: DIMENSIONS.SIDEBAR_CONTENT_WIDTH }}>
        <div className="w-1.5 h-1.5 bg-content-secondary"></div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
          /// {t('memoryDump')}
        </span>
      </div>

      {/* 滚动区域: Bauhaus风格滚动条 - 最大高度显示8条，超出滚动 */}
      <div className="overflow-y-auto px-3 space-y-1 mx-auto bauhaus-scrollbar" style={{ maxHeight: '360px', width: DIMENSIONS.SIDEBAR_CONTENT_WIDTH }}>
        {/* 列表项: 极简、紧凑、数据感 */}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onConversationClick(conv.id, conv.agent_id)}
            className="group w-full text-left flex items-center gap-3 px-3 py-1.5 border border-transparent hover:border-border hover:bg-surface-page transition-all"
          >
            {/* 装饰性光标: Hover时出现 */}
            <span className="text-accent-hover font-black text-xs opacity-0 group-hover:opacity-100 transition-opacity">
              &gt;
            </span>

            <div className="flex-1 min-w-0">
              {/* 标题: 等宽字体，像日志 */}
              <div className="font-mono text-[11px] font-bold text-content-secondary truncate group-hover:text-content-primary transition-colors">
                {conv.title || t('newChat')}
              </div>
              {/* 时间: 极小字体 */}
              <div className="font-mono text-[9px] text-content-secondary opacity-50 truncate">
                LOG_ID: {conv.id.slice(0, 6)} • {formatRelativeTime(conv.updated_at)}
              </div>
            </div>
          </button>
        ))}

        {/* 如果没有会话，显示空状态 */}
        {conversations.length === 0 && (
          <div className="px-3 py-2 font-mono text-[10px] text-content-secondary opacity-40">
            {t('noDataStream')}
          </div>
        )}
      </div>

      {/* 底部渐变遮罩: 提示还有更多内容 */}
      <div className="h-4 bg-gradient-to-t from-surface-card to-transparent pointer-events-none shrink-0 mx-auto" style={{ width: DIMENSIONS.SIDEBAR_CONTENT_WIDTH }} />
    </div>
  )
}
