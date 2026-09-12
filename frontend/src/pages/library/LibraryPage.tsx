/**
 * 资源库页面 (Library)
 *
 * 统一的资源管理中枢：知识库 / 技能模板 / MCP / 工具治理。
 * 布局与系统管理共用 SubPageLayout（侧边子菜单 + 滚动正文）。
 */

import { useState } from 'react'
import { Bot, Database, Wrench } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useSwipeBack } from '@/hooks/useSwipeBack'
import { SearchInput } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { SubPageLayout, SubPageHeader } from '@/components/ui/sub-page-layout'
import { MCPList } from './MCPList'
import SkillTemplatePanel from './SkillTemplatePanel'
import { useUserStore } from '@/store/userStore'

type TabType = 'knowledge' | 'templates' | 'mcp'

export default function LibraryPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabType>('templates')
  const [searchQuery, setSearchQuery] = useState('')
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeBack({ targetPath: '/' })

  // Library 权限：可编辑模板与策略（管理动作在系统管理台）
  const canEditLibrary = useUserStore(state => state.user?.role === 'admin')

  const menu = [
    { key: 'knowledge', label: t('knowledgeBase') || 'Knowledge', icon: Database },
    { key: 'templates', label: t('skillTemplates') || 'Templates', icon: Bot },
    { key: 'mcp', label: t('mcpTools') || 'MCP', icon: Wrench },

  ]
  const activeLabel = menu.find(item => item.key === activeTab)?.label ?? t('railLibrary')

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
        <div className="mx-auto max-w-6xl">
          <SubPageHeader
            title={activeLabel}
            right={
              <div className="flex h-9 w-72 items-center">
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={
                    activeTab === 'knowledge'
                      ? (t('searchKnowledge') || 'Search knowledge base...')
                      : activeTab === 'templates'
                        ? (t('searchTemplates') || 'Search templates...')
                        : (t('searchMCPServers') || 'Search MCP servers...')
                  }
                />
              </div>
            }
          />

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
          </div>
        </div>
      </SubPageLayout>
    </div>
  )
}

/**
 * 知识库内容（占位，统一空态形态）
 */
function KnowledgeBaseContent() {
  const { t } = useTranslation()

  return (
    <EmptyState
      variant="card"
      icon={Database}
      title={t('comingSoon') || 'Coming Soon'}
      description={t('knowledgeBaseDescription') || 'Knowledge base feature is under development'}
    />
  )
}
