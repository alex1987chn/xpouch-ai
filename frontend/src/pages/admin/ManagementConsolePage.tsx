/**
 * ManagementConsolePage - 管理控制台（admin 专属）
 *
 * 实例级管理功能的统一入口（v3.4.7 管理侧/个人域隔离）：
 * 六个分区原地切换，布局复用 SubPageLayout（与资源库同构）：
 * - 系统状态：部署检查面（SystemStatusSection 复用）
 * - 专家与模型：专家卡片栅格（ExpertAdminPage embedded 模式）+ 模型配置
 * - 工具治理：ToolGovernancePanel（admin 读写）
 * - 模板管理：SkillTemplatePanel（admin 读写）
 * 未来：用户管理等新管理面在此扩展。
 *
 * 权限：仅 ADMIN；普通用户渲染 PermissionLockCard（可见但锁，DESIGN.md §4.5）
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, ShieldCheck, FileCode, Cpu, Activity, Plug, Users } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useUserStore } from '@/store/userStore'
import { SearchInput } from '@/components/ui/input'
import { SubPageLayout, SubPageHeader } from '@/components/ui/sub-page-layout'
import { PermissionLockCard } from '@/components/ui/lock-card'
import { SystemStatusSection } from '@/components/settings/sections/SystemStatusSection'
import ExpertAdminPage from './ExpertAdminPage'
import ToolGovernancePanel from '../library/ToolGovernancePanel'
import { ModelSection } from '@/components/settings/sections/ModelSection'
import SkillTemplatePanel from '../library/SkillTemplatePanel'
import UserAdminPanel from './UserAdminPanel'
import { MCPList } from '../library/MCPList'

type ConsoleTab = 'system' | 'experts' | 'governance' | 'templates' | 'mcp' | 'model' | 'users'

export default function ManagementConsolePage() {
 const { t } = useTranslation()
 const role = useUserStore(state => state.user?.role ?? '')
 const isAdmin = role === 'admin'

 const [tab, setTab] = useState<ConsoleTab>('system')
 const [searchParams] = useSearchParams()

 // 侧边栏子项深链（/admin/console?tab=xxx）同步到分区
 useEffect(() => {
  const paramTab = searchParams.get('tab') as ConsoleTab | null
  if (paramTab && ['system', 'experts', 'governance', 'templates', 'mcp', 'model', 'users'].includes(paramTab)) {
   setTab(paramTab)
  }
 }, [searchParams])
 const [governanceQuery, setGovernanceQuery] = useState('')
 const [mcpQuery, setMcpQuery] = useState('')
 const [templateQuery, setTemplateQuery] = useState('')
 const [usersQuery, setUsersQuery] = useState('')

 // 权限锁定态（可见但锁）
 if (!isAdmin) {
  return (
   <div className="flex h-full items-center justify-center bg-surface-page p-4">
    <div className="w-full max-w-xl">
     <PermissionLockCard description={t('systemStatusLockedDesc')} />
    </div>
   </div>
  )
 }

 const tabs = [
  { key: 'system', label: t('systemStatus'), icon: Activity },
  { key: 'experts', label: t('navExperts'), icon: Bot },
  { key: 'model', label: t('modelConfig'), icon: Cpu },
  { key: 'governance', label: t('toolGovernance'), icon: ShieldCheck },
  { key: 'templates', label: t('templateManagement'), icon: FileCode },
  { key: 'mcp', label: t('mcpManagement'), icon: Plug },
  { key: 'users', label: t('userManagement'), icon: Users },
 ]

 // 分区级搜索（仅列表型分区）：住在标题行右槽
 const sectionSearch: Partial<Record<ConsoleTab, { value: string; set: (v: string) => void; placeholder: string }>> = {
  governance: { value: governanceQuery, set: setGovernanceQuery, placeholder: t('searchTools') },
  templates: { value: templateQuery, set: setTemplateQuery, placeholder: t('searchTemplates') },
  mcp: { value: mcpQuery, set: setMcpQuery, placeholder: t('searchMCPServers') },
  users: { value: usersQuery, set: setUsersQuery, placeholder: t('searchUsers') },
 }
 const search = sectionSearch[tab]
 const activeLabel = tabs.find(item => item.key === tab)?.label ?? t('navConsole')

 return (
  <SubPageLayout
   menu={tabs}
   active={tab}
   onSelect={key => setTab(key as ConsoleTab)}
  >
   <div className="mx-auto max-w-6xl">
    <SubPageHeader
     title={activeLabel}
     right={
      <div className="flex h-9 items-center gap-3">
       {search && (
        <div className="w-72">
         <SearchInput value={search.value} onChange={search.set} placeholder={search.placeholder} />
        </div>
       )}
       <span className="rounded-full bg-accent-brand/15 px-2 py-0.5 text-micro font-bold text-content-primary">
        ADMIN
       </span>
      </div>
     }
    />

    <div key={tab} className="flex animate-in flex-col gap-4 fade-in duration-150">
     {tab === 'system' && <SystemStatusSection />}
     {tab === 'experts' && <ExpertAdminPage embedded />}
     {tab === 'model' && <ModelSection />}
     {tab === 'governance' && <ToolGovernancePanel searchQuery={governanceQuery} canView canEdit />}
     {tab === 'templates' && <SkillTemplatePanel searchQuery={templateQuery} canEdit />}
     {tab === 'mcp' && <MCPList searchQuery={mcpQuery} isAdmin />}
     {tab === 'users' && <UserAdminPanel searchQuery={usersQuery} />}
    </div>
   </div>
  </SubPageLayout>
 )
}
