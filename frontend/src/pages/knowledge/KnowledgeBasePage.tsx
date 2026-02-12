import { useState } from 'react'
import { Plus, FileText, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { useApp } from '@/providers/AppProvider'

export default function KnowledgeBasePage() {
  const { t } = useTranslation()
  const { sidebar } = useApp()
  const [searchQuery, setSearchQuery] = useState('')
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({ targetPath: '/' })

  // 创建知识库（暂未实现）
  const handleCreateKnowledgeBase = () => {
    // TODO: 实现创建知识库逻辑
  }

  return (
    <div className="bg-transparent overflow-x-hidden w-full h-full flex flex-col">
      {/* Bauhaus Header - 硬边风格 */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-40 h-[60px] px-6 border-b-2 border-[var(--border-color)] bg-[var(--bg-card)] transition-all duration-200",
          "lg:px-6",
          sidebar.isCollapsed ? "lg:pl-[88px]" : "lg:pl-[320px]"
        )}
      >
        <div className="w-full max-w-5xl mx-auto h-full flex items-center">
          {/* 左侧：标题 */}
          <div className="flex items-center h-full gap-3">
            <div className="w-2 h-2 bg-[var(--accent-hover)]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              ///
            </span>
            <h2 className="text-base font-black uppercase tracking-tight text-[var(--text-primary)]">
              {t('knowledgeBase')}
            </h2>
          </div>
          {/* 右侧：功能操作区 - Bauhaus按钮 */}
          <button
            onClick={handleCreateKnowledgeBase}
            className="ml-auto h-10 px-4 border-2 border-[var(--border-color)] bg-[var(--accent-hover)] text-black font-bold font-mono text-xs uppercase shadow-[var(--shadow-color)_3px_3px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_4px_4px_0_0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2"
            title={t('newKnowledgeBase')}
          >
            <Plus className="w-4 h-4" />
            <span>NEW</span>
          </button>
        </div>
      </header>

      {/* 可滚动内容区 - Bauhaus风格 */}
      <div
        className="h-full overflow-y-auto bauhaus-scrollbar overscroll-behavior-y-contain overflow-x-hidden pt-[60px]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 搜索框 - Bauhaus风格 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-4 mt-6">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder={t('searchKnowledge')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 border-2 border-[var(--border-color)] bg-[var(--bg-page)] font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
            />
          </div>
        </div>

        {/* 占位提示 - 知识库功能暂未实现 */}
        <div className="max-w-5xl mx-auto px-6 md:px-12 pb-24 md:pb-20">
          <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-card)]/50">
            <div className="w-16 h-16 mb-6 border-2 border-[var(--border-color)] bg-[var(--bg-page)] flex items-center justify-center">
              <FileText className="w-8 h-8 text-[var(--text-secondary)]" />
            </div>
            <p className="font-mono text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest mb-2">
              敬请期待
            </p>
            <p className="font-mono text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              Knowledge Base Coming Soon
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}

