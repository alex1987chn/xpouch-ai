/**
 * ManagementConsolePage - 管理控制台（admin 专属）
 *
 * 实例级管理功能的统一入口（v3.4.7 管理侧/个人域隔离）：
 * 左栏分区原地切换（与设置中心同交互），六个分区：
 * - 系统状态：部署检查面（SystemStatusSection 复用）
 * - 专家与模型：专家工作台内嵌（ExpertAdminPage embedded 模式）
 * - 工具治理：ToolGovernancePanel（admin 读写）
 * - 模板管理：SkillTemplatePanel（admin 读写）
 * 未来：用户管理等新管理面在此扩展。
 *
 * 布局对齐 docs/design 蓝本：168px 子导航（subrail）+ 滚动正文
 * （admin-body），窗格宽度约束 max-w-[860px]。
 *
 * 权限：仅 ADMIN；普通用户渲染 PermissionLockCard（可见但锁，DESIGN.md §4.5）
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, ShieldCheck, FileCode, Cpu, Activity, Search, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useUserStore } from '@/store/userStore'
import PageTitle from '@/components/layout/PageTitle'
import { PermissionLockCard } from '@/components/ui/lock-card'
import { SystemStatusSection } from '@/components/settings/sections/SystemStatusSection'
import ExpertAdminPage from './ExpertAdminPage'
import ToolGovernancePanel from '../library/ToolGovernancePanel'
import { ModelSection } from '@/components/settings/sections/ModelSection'
import SkillTemplatePanel from '../library/SkillTemplatePanel'
import { MCPList } from '../library/MCPList'

type ConsoleTab = 'system' | 'experts' | 'governance' | 'templates' | 'mcp' | 'model'

export default function ManagementConsolePage() {
 const { t } = useTranslation()
 const role = useUserStore(state => state.user?.role ?? '')
 const isAdmin = role === 'admin'

 const [tab, setTab] = useState<ConsoleTab>('system')
 const [searchParams] = useSearchParams()

 // 侧边栏子项深链（/admin/console?tab=xxx）同步到分区
 useEffect(() => {
  const paramTab = searchParams.get('tab') as ConsoleTab | null
  if (paramTab && ['system', 'experts', 'governance', 'templates', 'mcp', 'model'].includes(paramTab)) {
   setTab(paramTab)
  }
 }, [searchParams])
 const [governanceQuery, setGovernanceQuery] = useState('')
 const [mcpQuery, setMcpQuery] = useState('')
 const [templateQuery, setTemplateQuery] = useState('')

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

 const tabs: { key: ConsoleTab; label: string; icon: typeof Activity }[] = [
  { key: 'system', label: t('systemStatus'), icon: Activity },
  { key: 'experts', label: t('navExperts'), icon: Bot },
  { key: 'model', label: t('modelConfig'), icon: Cpu },
  { key: 'governance', label: t('toolGovernance'), icon: ShieldCheck },
  { key: 'templates', label: t('templateManagement'), icon: FileCode },
  { key: 'mcp', label: t('mcpManagement'), icon: Plug },
 ]

 return (
  <div className="flex h-full flex-col bg-surface-page lg:flex-row">
   {/* 子导航（蓝本 subrail：浅底选中） */}
   <div className="hidden w-[168px] shrink-0 flex-col gap-0.5 border-r border-border-divider bg-surface-card p-2.5 lg:flex">
    {tabs.map(({ key, label, icon: Icon }) => (
     <button
      key={key}
      onClick={() => setTab(key)}
      className={cn(
       'flex items-center gap-2 rounded-md px-3 py-2 text-[13px] transition-colors',
       tab === key
        ? 'bg-surface-tint font-bold text-content-primary'
        : 'text-content-secondary hover:bg-surface-tint/60 hover:text-content-primary'
      )}
     >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
     </button>
    ))}

    <div className="mt-auto border-t border-border-divider px-3 py-2 text-micro text-content-muted">
     {t('userManagementComingSoon')}
    </div>
   </div>

   {/* 窄屏：横向页签条 */}
   <div className="w-full shrink-0 border-b border-border-divider bg-surface-card p-2 lg:hidden">
    <div className="flex gap-1 overflow-x-auto">
     {tabs.map(({ key, label, icon: Icon }) => (
      <button
       key={key}
       onClick={() => setTab(key)}
       className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
        tab === key
         ? 'bg-surface-tint font-bold text-content-primary'
         : 'text-content-secondary hover:bg-surface-tint/60'
       )}
      >
       <Icon className="h-3.5 w-3.5" />
       <span>{label}</span>
      </button>
     ))}
    </div>
   </div>

   {/* 正文（admin-body：页内滚动，窗格约束宽度） */}
   <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-6 md:px-7">
    <div
     key={tab}
     className="max-w-[860px] animate-in fade-in duration-150"
    >
     <PageTitle
      title={t('navConsole')}
      right={
       <span className="rounded-full bg-accent-brand/15 px-2 py-0.5 text-micro font-bold text-content-primary">
        ADMIN
       </span>
      }
     />

     <div className="mt-5 flex flex-col gap-4">
      {tab === 'system' && <SystemStatusSection />}
      {tab === 'experts' && <ExpertAdminPage embedded />}
      {tab === 'model' && <ModelSection />}
      {tab === 'governance' && (
       <div className="flex-1 flex flex-col">
        <div className="relative mb-4">
         <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-secondary" />
         <input
          value={governanceQuery}
          onChange={e => setGovernanceQuery(e.target.value)}
          placeholder={t('searchTools')}
          className="w-full rounded-md border-theme-input border-border-default bg-surface-page py-2 pl-9 pr-3 text-sm transition-colors focus:outline-none focus:border-border-focus"
         />
        </div>
        <ToolGovernancePanel searchQuery={governanceQuery} canView canEdit />
       </div>
      )}
      {tab === 'templates' && (
       <div className="flex-1 flex flex-col">
        <div className="relative mb-4">
         <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-secondary" />
         <input
          value={templateQuery}
          onChange={e => setTemplateQuery(e.target.value)}
          placeholder={t('searchTemplates')}
          className="w-full rounded-md border-theme-input border-border-default bg-surface-page py-2 pl-9 pr-3 text-sm transition-colors focus:outline-none focus:border-border-focus"
         />
        </div>
        <SkillTemplatePanel searchQuery={templateQuery} canEdit />
       </div>
      )}
      {tab === 'mcp' && (
       <div className="flex-1 flex flex-col">
        <div className="relative mb-4">
         <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-secondary" />
         <input
          value={mcpQuery}
          onChange={e => setMcpQuery(e.target.value)}
          placeholder={t('searchTools')}
          className="w-full rounded-md border-theme-input border-border-default bg-surface-page py-2 pl-9 pr-3 text-sm transition-colors focus:outline-none focus:border-border-focus"
         />
        </div>
        <MCPList searchQuery={mcpQuery} isAdmin />
       </div>
      )}
     </div>
    </div>
   </div>
  </div>
 )
}
