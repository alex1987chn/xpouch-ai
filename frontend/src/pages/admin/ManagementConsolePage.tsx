/**
 * ManagementConsolePage - 管理控制台（admin 专属）
 *
 * 实例级管理功能的统一入口（v3.4.7 管理侧/个人域隔离）：
 * 左栏分区原地切换（与设置中心同交互），四个分区：
 * - 系统状态：部署检查面（SystemStatusSection 复用）
 * - 专家与模型：专家工作台内嵌（ExpertAdminPage embedded 模式）
 * - 工具治理：ToolGovernancePanel（admin 读写）
 * - 模板管理：SkillTemplatePanel（admin 读写）
 * 未来：用户管理等新管理面在此扩展。
 *
 * 权限：仅 ADMIN；普通用户渲染 PermissionLockCard（可见但锁，DESIGN.md §4.5）
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, ShieldCheck, FileCode, Activity, Search, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useUserStore } from '@/store/userStore'
import PageTitle from '@/components/layout/PageTitle'
import { PermissionLockCard } from '@/components/ui/lock-card'
import { SystemStatusSection } from '@/components/settings/sections/SystemStatusSection'
import ExpertAdminPage from './ExpertAdminPage'
import ToolGovernancePanel from '../library/ToolGovernancePanel'
import SkillTemplatePanel from '../library/SkillTemplatePanel'
import { MCPList } from '../library/MCPList'

type ConsoleTab = 'system' | 'experts' | 'governance' | 'templates' | 'mcp'

export default function ManagementConsolePage() {
  const { t } = useTranslation()
  const role = useUserStore(state => state.user?.role ?? '')
  const isAdmin = role === 'admin'

  const [tab, setTab] = useState<ConsoleTab>('system')
  const [searchParams] = useSearchParams()

  // 侧边栏子项深链（/admin/console?tab=xxx）同步到分区
  useEffect(() => {
    const paramTab = searchParams.get('tab') as ConsoleTab | null
    if (paramTab && ['system', 'experts', 'governance', 'templates', 'mcp'].includes(paramTab)) {
      setTab(paramTab)
    }
  }, [searchParams])
  const [governanceQuery, setGovernanceQuery] = useState('')
  const [mcpQuery, setMcpQuery] = useState('')
  const [templateQuery, setTemplateQuery] = useState('')

  // 权限锁定态（可见但锁）
  if (!isAdmin) {
    return (
      <div className="min-h-[100dvh] bg-surface-page flex items-center justify-center p-4">
        <div className="w-full max-w-xl">
          <PermissionLockCard description={t('systemStatusLockedDesc')} />
        </div>
      </div>
    )
  }

  const tabs: { key: ConsoleTab; label: string; icon: typeof Activity }[] = [
    { key: 'system', label: t('systemStatus'), icon: Activity },
    { key: 'experts', label: t('navExperts'), icon: Bot },
    { key: 'governance', label: t('toolGovernance'), icon: ShieldCheck },
    { key: 'templates', label: t('templateManagement'), icon: FileCode },
    { key: 'mcp', label: t('mcpManagement'), icon: Plug },
  ]

  return (
    <div className="min-h-[100dvh] bg-surface-page px-6 md:px-12 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageTitle
          title={t('navConsole')}
          right={
            <span className="px-2 py-1 bg-status-warning/15 text-content-primary text-xs font-mono uppercase">
              ADMIN
            </span>
          }
        />

        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* 左栏：分区原地切换（与设置中心同交互） */}
          <div className="hidden lg:flex lg:flex-col w-[200px] shrink-0 border-2 border-border-default bg-surface-card shadow-theme-card p-2 gap-1 lg:sticky lg:top-8">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 text-xs font-bold uppercase border-2 transition-colors',
                  tab === key
                    ? 'bg-accent-hover/10 border-accent-hover text-content-primary'
                    : 'bg-transparent border-transparent text-content-secondary hover:bg-surface-page hover:border-border-default'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate">{label}</span>
              </button>
            ))}

            <div className="px-3 py-2 text-micro text-content-secondary opacity-50 uppercase tracking-widest border-t-2 border-border-default mt-1">
              {t('userManagementComingSoon')}
            </div>
          </div>

          {/* 内容：仅挂载当前分区（key 触发淡入） */}
          <div
            key={tab}
            className="flex-1 min-w-0 min-h-[70vh] flex flex-col animate-in fade-in duration-150"
          >
            {tab === 'system' && (
              <div className="border-2 border-border-default bg-surface-card shadow-theme-card flex flex-col">
                <SystemStatusSection />
              </div>
            )}
            {tab === 'experts' && <ExpertAdminPage embedded />}
            {tab === 'governance' && (
              <div className="flex-1 flex flex-col">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
                  <input
                    value={governanceQuery}
                    onChange={e => setGovernanceQuery(e.target.value)}
                    placeholder={t('searchTools')}
                    className="w-full pl-9 pr-3 py-2 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors"
                  />
                </div>
                <ToolGovernancePanel searchQuery={governanceQuery} canView canEdit />
              </div>
            )}
            {tab === 'templates' && (
              <div className="flex-1 flex flex-col">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
                  <input
                    value={templateQuery}
                    onChange={e => setTemplateQuery(e.target.value)}
                    placeholder={t('searchTemplates')}
                    className="w-full pl-9 pr-3 py-2 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors"
                  />
                </div>
                <SkillTemplatePanel searchQuery={templateQuery} canEdit />
              </div>
            )}
            {tab === 'mcp' && (
              <div className="flex-1 flex flex-col">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
                  <input
                    value={mcpQuery}
                    onChange={e => setMcpQuery(e.target.value)}
                    placeholder={t('searchTools')}
                    className="w-full pl-9 pr-3 py-2 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors"
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
