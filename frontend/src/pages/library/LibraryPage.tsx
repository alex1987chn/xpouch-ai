/**
 * 资源库页面 (Library)
 *
 * 统一的资源管理中枢：知识库 / 技能模板 / MCP / 工具治理。
 * 布局与系统管理共用 SubPageLayout（侧边子菜单 + 滚动正文）。
 */

import { useState } from 'react'
import { Bot, Database, ShieldAlert, Wrench } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { SearchInput } from '@/components/ui/input'
import { SubPageLayout, SubPageHeader } from '@/components/ui/sub-page-layout'
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

  const menu = [
    { key: 'knowledge', label: t('knowledgeBase') || 'Knowledge', icon: Database },
    { key: 'templates', label: t('skillTemplates') || 'Templates', icon: Bot },
    { key: 'mcp', label: t('mcpTools') || 'MCP', icon: Wrench },
    ...(canViewGovernance ? [{ key: 'governance', label: t('toolGovernance') || 'Governance', icon: ShieldAlert }] : []),
  ]

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="h-full min-h-0"
    >
      <SubPageLayout
        menu={menu}
        active={activeTab}
        onSelect={key => setActiveTab(key as TabType)}
      >
        <div className="mx-auto max-w-5xl">
          <SubPageHeader title={t('railLibrary')} />

          {/* 搜索：统一组件，各分区共用 */}
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

          <div className="pb-12">
            {activeTab === 'knowledge' && (
              <KnowledgeBaseContent />
            )}
            {activeTab === 'templates' && (
              <SkillTemplatePanel searchQuery={searchQuery} canEdit={canEditLibrary} />
            )}
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
      </SubPageLayout>
    </div>
  )
}

/**
 * 知识库内容（占位）
 */
function KnowledgeBaseContent() {
  const { t } = useTranslation()

  return (
    <div className="py-20 text-center">
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
