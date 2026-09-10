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
import { Bot, Database, ShieldAlert, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { SearchInput } from '@/components/ui/input'
import PageTitle from '@/components/layout/PageTitle'
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
    <div className="min-h-screen bg-surface-page px-6 md:px-12 py-8">
      {/* 内容区域（标题行内嵌文档流，定位由侧边栏承担） */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="max-w-5xl mx-auto space-y-6"
      >
        {/* 标题行（PageTitle 统一习语） */}
        <PageTitle title={t('workshop') || 'WORKSHOP'} />

        {/* Tabs 导航 */}
        <div className="flex gap-1 border-b-2 border-border-default">
            {/* Knowledge Base Tab */}
            <TabButton
              isActive={activeTab === 'knowledge'}
              onClick={() => setActiveTab('knowledge')}
              icon={<Database className="w-4 h-4" />}
              label={t('knowledgeBase') || 'KNOWLEDGE BASE'}
            />

            <TabButton
              isActive={activeTab === 'templates'}
              onClick={() => setActiveTab('templates')}
              icon={<Bot className="w-4 h-4" />}
              label={t('skillTemplates') || 'SKILL TEMPLATES'}
            />

            {/* MCP Tools Tab */}
            <TabButton
              isActive={activeTab === 'mcp'}
              onClick={() => setActiveTab('mcp')}
              icon={<Wrench className="w-4 h-4" />}
              label={t('mcpTools') || 'MCP TOOLS'}
            />

            {canViewGovernance && (
              <TabButton
                isActive={activeTab === 'governance'}
                onClick={() => setActiveTab('governance')}
                icon={<ShieldAlert className="w-4 h-4" />}
                label={t('toolGovernance') || 'TOOL GOVERNANCE'}
              />
            )}
        </div>

        {/* 页面内容 */}
        <div className="pb-16 md:pb-12">
          {/* 搜索框 - 两个标签共用 */}
          <div className="mb-4">
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
          </div>

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
          ? "bg-surface-card text-content-primary border-border-default z-10"
          : "bg-surface-page text-content-secondary border-border-default/40 hover:border-border-default hover:text-content-primary"
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
      <div className="w-16 h-16 mx-auto mb-4 border-2 border-border-default bg-surface-page flex items-center justify-center">
        <Database className="w-8 h-8 text-content-secondary" />
      </div>
      <h3 className="font-mono text-base font-bold text-content-primary uppercase mb-2">
        {t('comingSoon') || 'Coming Soon'}
      </h3>
      <p className="font-mono text-xs text-content-secondary uppercase max-w-sm mx-auto">
        {t('knowledgeBaseDescription') || 'Knowledge base feature is under development'}
      </p>
    </div>
  )
}
