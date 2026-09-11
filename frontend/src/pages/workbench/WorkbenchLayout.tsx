/**
 * WorkbenchLayout - 工作台专属壳（阶段 2 新 IA 的应用框架）
 *
 * [设计] 蓝本形态：顶栏（logo + ⌘K + 审批 chip + 主题切换 + 头像）
 * + 60px 三目的地图标栏（工作台/资源库/管理）+ 内容区。
 * 工作台路由脱离旧 AppLayout（旧壳的六项导航与地层功能重复）。
 *
 * [边界] 旧页面仍走 AppLayout；cutover 时此壳升格为全局壳并收敛导航。
 * SettingsHubDialog/LoginDialog 自管开关（appUIStore/userStore），此处挂载。
 */

import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { LayoutGrid, Layers, ShieldCheck } from 'lucide-react'

import { useUserStore } from '@/store/userStore'
import { useAppUISelectors } from '@/hooks'
import { useIsWaitingForApproval } from '@/hooks/useTaskSelectors'
import { useChatStore } from '@/store/chatStore'
import { ThemeSwitcher } from '@/components/settings/ThemeSwitcher'
import { SettingsHubDialog } from '@/components/settings/SettingsHubDialog'
import LoginDialog from '@/components/auth/LoginDialog'
import { cn } from '@/lib/utils'
import { Z_INDEX } from '@/constants/zIndex'

/** 顶栏 logo 标记（蓝本：几何口袋） */
function LogoMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="h-5 w-5 rounded-[50%_50%_50%_0] bg-accent-brand" />
      <span className="font-display text-base font-bold tracking-tight text-content-primary">
        xpouch
      </span>
    </span>
  )
}

export default function WorkbenchLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated } = useUserStore()
  const { dialogs } = useAppUISelectors()
  const isAwaiting = useIsWaitingForApproval()

  const isAdmin = user?.role === 'admin'
  const onWorkbench = location.pathname.startsWith('/workbench')

  const avatarNode = user?.avatar ? (
    <img src={user.avatar} alt="" className="h-7 w-7 rounded-full border border-border-default object-cover" />
  ) : (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-content-primary text-xs font-bold text-surface-card">
      {(user?.username || 'U').charAt(0).toUpperCase()}
    </span>
  )

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-surface-page">
      {/* ===== 顶栏 ===== */}
      <header className="relative z-40 flex h-[52px] shrink-0 items-center gap-3 border-b border-border-divider bg-surface-card px-4">
        <button onClick={() => navigate('/workbench')} aria-label="xpouch">
          <LogoMark />
        </button>

        {/* ⌘K 药丸（命令面板为收尾件，先行占位视觉） */}
        <button
          onClick={() => navigate('/workbench')}
          className="mx-auto hidden h-[34px] w-[400px] items-center gap-2.5 rounded-full border-theme-input border-border-default bg-surface-page px-4 text-[13px] text-content-muted transition-all hover:border-border-hover hover:shadow-theme-card sm:flex"
          title={t('workbenchTitle')}
        >
          <span className="rounded border border-border-default bg-surface-card px-1.5 py-px font-mono text-[11px] font-bold text-content-secondary">⌘K</span>
          <span>{t('strataSearch')}</span>
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          {/* 审批注意力 chip：当前线程待裁决时点亮 */}
          {isAwaiting && (
            <button
              onClick={() => {
                const tid = useChatStore.getState().currentConversationId
                if (tid) navigate(`/workbench/${tid}`)
              }}
              className="flex h-[30px] items-center gap-1.5 rounded-full border border-accent-warning/30 bg-accent-warning/10 px-3 text-xs font-medium text-accent-warning transition-all hover:shadow-theme-card"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-warning" />
              {t('chipAwaiting')}
            </button>
          )}
          <ThemeSwitcher variant="floating" />
          {/* 头像 → 设置中心（登录态）/ 登录（未登录） */}
          <button
            onClick={() => (isAuthenticated ? dialogs.openSettings() : dialogs.openLogin())}
            aria-label={isAuthenticated ? t('userSettings') : t('login')}
            className="flex items-center"
          >
            {avatarNode}
          </button>
        </div>
      </header>

      {/* ===== 主体：图标栏 + 内容 ===== */}
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-[60px] shrink-0 flex-col items-center gap-1.5 border-r border-border-divider bg-surface-card py-3.5 md:flex">
          {([
            { key: 'work', icon: LayoutGrid, label: t('workbenchTitle'), to: '/workbench', active: onWorkbench },
            { key: 'lib', icon: Layers, label: t('library'), to: '/library', active: location.pathname.startsWith('/library') },
            ...(isAdmin ? [{ key: 'admin', icon: ShieldCheck, label: t('navConsole'), to: '/admin/console', active: location.pathname.startsWith('/admin') }] : []),
          ] as const).map(({ key, icon: Icon, label, to, active }) => (
            <button
              key={key}
              onClick={() => navigate(to)}
              title={label}
              aria-label={label}
              className={cn(
                'relative flex h-[42px] w-[42px] items-center justify-center rounded-md transition-colors',
                active
                  ? 'bg-surface-elevated text-content-primary'
                  : 'text-content-muted hover:bg-surface-elevated/60 hover:text-content-primary'
              )}
            >
              {active && <span className="absolute -left-[9px] top-[10px] bottom-[10px] w-[3px] rounded-full bg-accent-brand" />}
              <Icon className="h-[19px] w-[19px]" />
            </button>
          ))}
        </nav>

        {/* 页面内容（工作台/资源库/管理分区） */}
        <div className="min-w-0 flex-1" style={{ zIndex: Z_INDEX.CONTENT }}>
          <Outlet />
        </div>
      </div>

      {/* ===== 全局弹窗（工作台壳自挂：设置中心 + 登录） ===== */}
      <SettingsHubDialog />
      <LoginDialog
        open={dialogs.loginOpen}
        onOpenChange={(open) => (open ? dialogs.openLogin() : dialogs.closeLogin())}
      />
    </div>
  )
}
