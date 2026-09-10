/**
 * ManagementConsolePage - 管理控制台（admin 专属）
 *
 * 实例级管理功能的统一入口（v3.4.7 管理侧/个人域隔离）：
 * - 左栏：系统状态（内嵌部署检查面）+ 各管理面快捷入口
 * - 专家与模型 / 工具治理与模板 / 运行统计 目前仍为独立页面，由此直达
 * - 未来：用户管理、配额治理等新管理面在此扩展
 *
 * 权限：仅 ADMIN；普通用户渲染 PermissionLockCard（可见但锁，DESIGN.md §4.5）
 */

import { useNavigate } from 'react-router-dom'
import { Bot, ShieldCheck, FileCode, BarChart3, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useUserStore } from '@/store/userStore'
import PageTitle from '@/components/layout/PageTitle'
import { PermissionLockCard } from '@/components/ui/lock-card'
import { SystemStatusSection } from '@/components/settings/sections/SystemStatusSection'

export default function ManagementConsolePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const role = useUserStore(state => state.user?.role ?? '')
  const isAdmin = role === 'admin'

  const quickLinks = [
    { key: 'experts', label: t('navExperts'), icon: Bot, path: '/admin/experts' },
    { key: 'governance', label: t('toolGovernance'), icon: ShieldCheck, path: '/library' },
    { key: 'templates', label: t('workshop'), icon: FileCode, path: '/library' },
    { key: 'stats', label: t('navStats'), icon: BarChart3, path: '/admin/stats' },
  ]

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

  return (
    <div className="min-h-[100dvh] bg-surface-page px-6 md:px-12 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageTitle
          title={t('managementConsole')}
          right={
            <span className="px-2 py-1 bg-status-warning/15 text-content-primary text-xs font-mono uppercase">
              ADMIN
            </span>
          }
        />

        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* 左栏：本页分区标识 */}
          <div className="hidden lg:flex lg:flex-col w-[200px] shrink-0 border-2 border-border-default bg-surface-card shadow-theme-card p-2 gap-1">
            <div className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold uppercase border-2 border-accent-hover bg-accent-hover/10 text-content-primary">
              <Activity className="w-4 h-4" />
              <span className="truncate">{t('systemStatus')}</span>
            </div>
            {quickLinks.map(({ key, label, icon: Icon, path }) => (
              <button
                key={key}
                onClick={() => navigate(path)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold uppercase border-2 border-transparent text-content-secondary hover:bg-surface-page hover:border-border-default transition-colors"
              >
                <Icon className="w-4 h-4" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {/* 内容：部署检查面 */}
          <div className="flex-1 min-w-0 border-2 border-border-default bg-surface-card shadow-theme-card flex flex-col">
            <SystemStatusSection />
          </div>
        </div>

        {/* 移动端快捷入口 */}
        <div className="lg:hidden grid grid-cols-2 gap-3">
          {quickLinks.map(({ key, label, icon: Icon, path }) => (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={cn(
                'flex items-center gap-2 border-2 border-border-default bg-surface-card shadow-theme-card px-3 py-3',
                'text-xs font-bold uppercase text-content-secondary hover:text-content-primary hover:border-border-strong transition-colors'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* 用户管理（未来特性占位） */}
        <div className="border-2 border-dashed border-border-default px-4 py-3 text-micro text-content-secondary opacity-60 uppercase tracking-widest">
          {t('userManagementComingSoon')}
        </div>
      </div>
    </div>
  )
}
