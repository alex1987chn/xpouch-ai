/**
 * 资源工坊页面 (Library/Workshop)
 *
 * 统一的资源管理中枢，整合：
 * - 知识库 (Knowledge Base)
 * - MCP 工具 (MCP Tools)
 *
 * 布局对齐 docs/design 蓝本：卡片色头部带（标题 + 下划线页签）
 * + 滚动正文（lib-head / lib-body / lib-tab 语法）。
 */

import { useState } from 'react'
import { Bot, Database, ShieldAlert, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { SearchInput } from '@/components/ui/input'
import { MCPList } from './MCPList'
import SkillTemplatePanel from './SkillTemplatePanel'
import ToolGovernancePanel from './ToolGovernancePanel'
import { useUserStore } from '@/store/userStore'

type TabType = 'knowledge' | 'templates' | 'mcp' | 'governance'

export default function LibraryPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabType>('templates')
  const [searchQuery, setSearchQuery] = useState('')
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({ targetPath: '/' })

  // Library 权限：可查看治理 Tab / 可编辑模板与策略
  const user = useUserStore(state => state.user)
  const role = user?.role ?? ''
  const canViewGovernance = role === 'admin'
  const canEditLibrary = role === 'admin'

  return (
    <div className="flex h-full flex-col bg-surface-page">
      {/* 头部带：标题 + 下划线页签（蓝本 lib-head / lib-tab） */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="shrink-0 border-b border-border-divider bg-surface-card px-6 pt-4 md:px-10"
      >
        <div className="max-w-6xl">
          <h2 className="text-[17px] font-bold text-content-primary">{t('workshop')}</h2>
          <div className="mt-2 flex gap-0.5">
            <TabButton
              isActive={activeTab === 'knowledge'}
              onClick={() => setActiveTab('knowledge')}
              icon={<Database className="h-4 w-4" />}
              label={t('knowledgeBase') || 'KNOWLEDGE BASE'}
            />
            <TabButton
              isActive={activeTab === 'templates'}
              onClick={() => setActiveTab('templates')}
              icon={<Bot className="h-4 w-4" />}
              label={t('skillTemplates') || 'SKILL TEMPLATES'}
            />
            <TabButton
              isActive={activeTab === 'mcp'}
              onClick={() => setActiveTab('mcp')}
              icon={<Wrench className="h-4 w-4" />}
              label={t('mcpTools') || 'MCP TOOLS'}
            />
            {canViewGovernance && (
              <TabButton
                isActive={activeTab === 'governance'}
                onClick={() => setActiveTab('governance')}
                icon={<ShieldAlert className="h-4 w-4" />}
                label={t('toolGovernance') || 'TOOL GOVERNANCE'}
              />
            )}
          </div>
        </div>
      </div>

      {/* 正文（lib-body：页内滚动） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 md:px-10">
        <div className="max-w-6xl space-y-4 pb-12">
          {/* 搜索框 - 各标签共用 */}
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={
              activeTab === 'knowledge'
                ? (t('searchKnowledge') || 'Search knowledge base...')
                : activeTab === 'templates'
                  ? (t('searchTemplates') || 'Search templates...')
                  : activeTab === 'governance'
                    ? (t('searchTools') || 'Search tools...')
                    : (t('searchMCPServers') || 'Search MCP servers...')
            }
          />

          {/* Knowledge Base 内容 */}
          {activeTab === 'knowledge' && (
            <KnowledgeBaseContent searchQuery={searchQuery} />
          )}

          {activeTab === 'templates' && (
            <SkillTemplatePanel searchQuery={searchQuery} canEdit={canEditLibrary} />
          )}

          {/* MCP Tools 内容 */}
          {activeTab === 'mcp' && (
            <MCPList
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              isAdmin={canEditLibrary}
            />
          )}

          {activeTab === 'governance' && (
            <ToolGovernancePanel searchQuery={searchQuery} canView={canViewGovernance} canEdit={canEditLibrary} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Tab 按钮组件（蓝本 lib-tab：下划线选中，2px 品牌色内嵌线）
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
        '-mb-px flex items-center gap-2 rounded-t-sm border-b-2 px-[18px] py-2 text-[13px] transition-colors',
        isActive
          ? 'border-accent-brand font-bold text-content-primary'
          : 'border-transparent text-content-secondary hover:bg-surface-tint/60 hover:text-content-primary'
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

function KnowledgeBaseContent({ searchQuery: _searchQuery }: KnowledgeBaseContentProps) {
  const { t } = useTranslation()

  // 空状态
  return (
    <div className="text-center py-20">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg border border-border-divider bg-surface-card">
        <Database className="h-8 w-8 text-content-secondary" />
      </div>
      <h3 className="mb-2 text-base font-bold text-content-primary">
        {t('comingSoon') || 'Coming Soon'}
      </h3>
      <p className="mx-auto max-w-sm text-xs text-content-secondary">
        {t('knowledgeBaseDescription') || 'Knowledge base feature is under development'}
      </p>
    </div>
  )
}
