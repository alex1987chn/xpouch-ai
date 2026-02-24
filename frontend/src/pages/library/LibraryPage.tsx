/**
 * 资源工坊页面 (Library/Workshop)
 * 
 * 统一的资源管理中枢，整合：
 * - 知识库 (Knowledge Base)
 * - MCP 工具 (MCP Tools)
 * 
 * 设计风格：与 HistoryPage 保持一致
 */

import { useState } from 'react'
import { Database, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { useApp } from '@/providers/AppProvider'
import { BauhausSearchInput } from '@/components/ui/bauhaus-input'
import { MCPList } from './MCPList'

type TabType = 'knowledge' | 'mcp'

export default function LibraryPage() {
  const { t } = useTranslation()
  const { sidebar } = useApp()
  const [activeTab, setActiveTab] = useState<TabType>('knowledge')
  const [searchQuery, setSearchQuery] = useState('')
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({ targetPath: '/' })

  return (
    <div className="bg-transparent overflow-x-hidden w-full h-full flex flex-col">
      {/* Header - 与 HistoryPage 保持一致 */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-40 h-[60px] px-6 border-b-2 border-bauhaus-border bg-[var(--bg-card)] transition-all duration-200",
          sidebar.isCollapsed ? "lg:pl-[88px]" : "lg:pl-[320px]"
        )}
      >
        <div className="w-full max-w-5xl mx-auto h-full flex items-center">
          {/* 左侧：标题 */}
          <div className="flex items-center h-full gap-3">
            <div className="w-2 h-2 bg-bauhaus-yellow" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-bauhaus-muted">
              ///
            </span>
            <h1 className="text-base font-black uppercase tracking-tight text-bauhaus-text">
              {t('workshop') || 'WORKSHOP'}
            </h1>
          </div>
        </div>
      </header>

      {/* 内容区域 */}
      <div
        className="h-full overflow-y-auto bauhaus-scrollbar overscroll-behavior-y-contain overflow-x-hidden pt-[60px]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Tabs 导航 - 移到内容区顶部 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 py-4">
          <div className="flex gap-1 border-b-2 border-bauhaus-border">
            {/* Knowledge Base Tab */}
            <TabButton
              isActive={activeTab === 'knowledge'}
              onClick={() => setActiveTab('knowledge')}
              icon={<Database className="w-4 h-4" />}
              label={t('knowledgeBase') || 'KNOWLEDGE BASE'}
            />

            {/* MCP Tools Tab */}
            <TabButton
              isActive={activeTab === 'mcp'}
              onClick={() => setActiveTab('mcp')}
              icon={<Wrench className="w-4 h-4" />}
              label={t('mcpTools') || 'MCP TOOLS'}
            />
          </div>
        </div>

        {/* 页面内容 */}
        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-24">
          {/* 搜索框 - 两个标签共用 */}
          <div className="mb-4">
            <BauhausSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={activeTab === 'knowledge' 
                ? (t('searchKnowledge') || 'Search knowledge base...')
                : (t('searchMCPServers') || 'Search MCP servers...')
              }
            />
          </div>

          {/* Knowledge Base 内容 */}
          {activeTab === 'knowledge' && (
            <KnowledgeBaseContent searchQuery={searchQuery} />
          )}

          {/* MCP Tools 内容 */}
          {activeTab === 'mcp' && (
            <MCPList 
              searchQuery={searchQuery} 
              onSearchChange={setSearchQuery}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Tab 按钮组件
 */
interface TabButtonProps {
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function TabButton({ isActive, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2 font-bold font-mono text-xs uppercase tracking-wide transition-all",
        "border-2 border-b-0 -mb-[2px]",
        isActive
          ? "bg-[var(--bg-card)] text-bauhaus-text border-bauhaus-border z-10"
          : "bg-bauhaus-bg text-bauhaus-muted border-bauhaus-border/40 hover:border-bauhaus-border hover:text-bauhaus-text"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/**
 * 知识库内容组件
 */
interface KnowledgeBaseContentProps {
  searchQuery: string
}

function KnowledgeBaseContent({ searchQuery }: KnowledgeBaseContentProps) {
  const { t } = useTranslation()

  // 空状态
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 mx-auto mb-4 border-2 border-bauhaus-border bg-bauhaus-bg flex items-center justify-center">
        <Database className="w-8 h-8 text-bauhaus-muted" />
      </div>
      <h3 className="font-mono text-base font-bold text-bauhaus-text uppercase mb-2">
        {t('comingSoon') || 'Coming Soon'}
      </h3>
      <p className="font-mono text-xs text-bauhaus-muted uppercase max-w-sm mx-auto">
        {t('knowledgeBaseDescription') || 'Knowledge base feature is under development'}
      </p>
    </div>
  )
}
