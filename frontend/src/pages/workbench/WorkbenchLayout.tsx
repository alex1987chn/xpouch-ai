/**
 * WorkbenchLayout - 工作台专属壳（阶段 2 新 IA 的应用框架）
 *
 * [设计] 蓝本形态：52px 顶栏（logo + ⌘K 药丸 + 审批 chip + 主题分段胶囊）
 * + 60px 三目的地图标栏（工作台/资源库/管理，底部头像）+ 内容区
 * + 28px 底部环境状态栏（连接状态 · 专家数 · 快捷键提示）。
 * 待裁决时右缘琥珀光晕（蓝本 edge-glow）作为第二注意力层。
 *
 * [边界] 旧页面仍走 AppLayout；cutover 时此壳升格为全局壳并收敛导航。
 * SettingsHubDialog/LoginDialog 自管开关（appUIStore/userStore），此处挂载。
 */

import { useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@/i18n'
import { LayoutGrid, Layers, Settings } from 'lucide-react'

import { useUserStore } from '@/store/userStore'
import { useAppUISelectors } from '@/hooks'
import { useIsWaitingForApproval } from '@/hooks/useTaskSelectors'
import { useChatStore } from '@/store/chatStore'
import { useAgentsQuery } from '@/hooks/queries/useAgentsQuery'
import { useUserSettingsQuery } from '@/hooks/queries/useUserSettingsQuery'
import { getSystemStatus } from '@/services/systemStatus'
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
  const { data: agents } = useAgentsQuery({ includeDefault: true })
  const isAdmin = user?.role === 'admin'

  // 连接状态（navigator.onLine，真实信号，不做假数据）
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  // 底栏真实信号：默认模型（用户级）/ 数据库连接（admin 级，与系统状态面共享缓存）
  const { data: settingsData } = useUserSettingsQuery(isAuthenticated)
  const { data: sysStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: getSystemStatus,
    enabled: isAdmin,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })

  // G 键两段跳转（蓝本 G W/L/A）：g 后 900ms 内按 w/l/a
  const gPendingRef = useRef(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'g') {
        gPendingRef.current = Date.now()
        return
      }
      if (Date.now() - gPendingRef.current < 900) {
        gPendingRef.current = 0
        if (k === 'w') navigate('/workbench')
        else if (k === 'l') navigate('/library')
        else if (k === 'a' && isAdmin) navigate('/admin/console')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, isAdmin])

  // 工作台域：'/'（即工作台）、/workbench、任务控制 /run
  const onWorkbench =
    location.pathname === '/' ||
    location.pathname.startsWith('/workbench') ||
    location.pathname.startsWith('/run')

  const goDecide = () => {
    const tid = useChatStore.getState().currentConversationId
    if (tid) navigate(`/workbench/${tid}`)
  }

  const avatarNode = user?.avatar ? (
    <img src={user.avatar} alt="" className="h-[30px] w-[30px] rounded-full border border-border-divider object-cover" />
  ) : (
    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#6f93ad,#b45f55)] text-xs font-bold text-white">
      {(user?.username || 'U').charAt(0).toUpperCase()}
    </span>
  )

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-surface-page">
      {/* ===== 顶栏 ===== */}
      <header className="relative z-40 flex h-[52px] shrink-0 items-center gap-3.5 border-b border-border-divider bg-surface-card px-4">
        <button onClick={() => navigate('/workbench')} aria-label="xpouch">
          <LogoMark />
        </button>

        {/* ⌘K 药丸：绝对定位真居中（蓝本视觉中轴） */}
        <button
          onClick={() => navigate('/workbench')}
          className="absolute left-1/2 top-1/2 hidden h-[34px] w-[400px] -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full border-theme-input border-border-default bg-surface-page px-3.5 text-[13px] text-content-muted transition-all hover:border-border-hover hover:shadow-theme-card sm:flex"
          title={t('cmdSearch')}
        >
          <span className="rounded border border-border-default bg-surface-card px-1.5 py-px font-display text-[11px] font-bold text-content-secondary">⌘K</span>
          <span className="truncate">{t('cmdSearch')}</span>
        </button>

        <div className="ml-auto flex items-center gap-2.5">
          {/* 审批注意力 chip：当前线程待裁决时点亮 */}
          {isAwaiting && (
            <button
              onClick={goDecide}
              className="flex h-[30px] items-center gap-1.5 rounded-full border border-border-divider bg-accent-warning/10 px-3 text-xs font-medium text-accent-warning transition-all hover:shadow-theme-card"
            >
              <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-accent-warning" />
              {t('chipAwaiting')}
            </button>
          )}
          {/* 主题分段胶囊（蓝本 .seg） */}
          <ThemeSwitcher variant="seg" />
        </div>
      </header>

      {/* ===== 主体：图标栏 + 内容 ===== */}
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-[60px] shrink-0 flex-col items-center gap-1.5 border-r border-border-divider bg-surface-card py-3.5 md:flex">
          {([
            { key: 'work', icon: LayoutGrid, label: t('workbenchTitle'), to: '/workbench', active: onWorkbench },
            { key: 'lib', icon: Layers, label: t('railLibrary'), to: '/library', active: location.pathname.startsWith('/library') },
            ...(isAdmin ? [{ key: 'admin', icon: Settings, label: t('navConsole'), to: '/admin/console', active: location.pathname.startsWith('/admin') }] : []),
          ] as const).map(({ key, icon: Icon, label, to, active }) => (
            <button
              key={key}
              onClick={() => navigate(to)}
              title={label}
              aria-label={label}
              className={cn(
                'relative flex h-[42px] w-[42px] items-center justify-center rounded-md transition-colors',
                active
                  ? 'bg-surface-tint text-content-primary'
                  : 'text-content-muted hover:bg-surface-tint/60 hover:text-content-primary'
              )}
            >
              {active && <span className="absolute -left-[9px] top-[10px] bottom-[10px] w-[3px] rounded-full bg-accent-brand" />}
              <Icon className="h-[19px] w-[19px]" />
            </button>
          ))}

          {/* 栏底：账号入口（蓝本 rail 底部头像；对话即桌面惯例同 ChatGPT/Claude） */}
          <span className="flex-1" />
          <button
            onClick={() => (isAuthenticated ? dialogs.openSettings() : dialogs.openLogin())}
            aria-label={isAuthenticated ? t('userSettings') : t('login')}
            title={isAuthenticated ? (user?.username || '') : t('login')}
            className="flex items-center transition-opacity hover:opacity-80"
          >
            {avatarNode}
          </button>
        </nav>

        {/* 页面内容（工作台/资源库/管理分区；页内滚动） */}
        <div className="min-w-0 flex-1 overflow-y-auto" style={{ zIndex: Z_INDEX.CONTENT }}>
          <Outlet />
        </div>
      </div>

      {/* ===== 右缘审批光晕（蓝本 edge-glow：有事项等你裁决） ===== */}
      {isAwaiting && (
        <button
          onClick={goDecide}
          aria-label={t('goToDecide')}
          title={t('goToDecide')}
          className="fixed bottom-7 right-0 top-[52px] z-30 w-[7px] bg-gradient-to-b from-transparent via-accent-warning/55 to-transparent blur-[1px]"
        />
      )}

      {/* ===== 底部环境状态栏（蓝本 .sb，只展示真实信号） ===== */}
      <footer className="relative z-30 flex h-7 shrink-0 items-center gap-4 border-t border-border-divider bg-surface-card px-3.5 text-nano text-content-muted">
        <span className={cn('h-[7px] w-[7px] shrink-0 animate-pulse rounded-full', online ? 'bg-status-online' : 'bg-accent-warning')} />
        <span>{online ? t('sbOnline') : t('sbOffline')}</span>
        {isAdmin && sysStatus && (
          <>
            <span className="h-3 w-px bg-border-divider" />
            <span className={cn(!sysStatus.database.connected && 'text-accent-warning')}>
              PostgreSQL · {sysStatus.database.connected ? t('sbDbConnected') : t('sbDbDisconnected')}
            </span>
          </>
        )}
        {settingsData?.default_model?.id && (
          <>
            <span className="h-3 w-px bg-border-divider" />
            <span className="font-display">{settingsData.default_model.id}</span>
          </>
        )}
        {(agents?.length ?? 0) > 0 && (
          <>
            <span className="h-3 w-px bg-border-divider" />
            <span>{t('expertLabel')} · {agents?.length}</span>
          </>
        )}
        <span className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border-divider bg-surface-card px-1.5 font-display text-[9.5px] font-bold text-content-muted">⌘K</kbd>
            {t('sbCommands')}
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <kbd className="rounded border border-border-divider bg-surface-card px-1.5 font-display text-[9.5px] font-bold text-content-muted">G</kbd>
            <kbd className="rounded border border-border-divider bg-surface-card px-1.5 font-display text-[9.5px] font-bold text-content-muted">W/L/A</kbd>
            {t('sbJump')}
          </span>
        </span>
      </footer>

      {/* ===== 全局弹窗（工作台壳自挂：设置中心 + 登录） ===== */}
      <SettingsHubDialog />
      <LoginDialog
        open={dialogs.loginOpen}
        onOpenChange={(open) => (open ? dialogs.openLogin() : dialogs.closeLogin())}
      />
    </div>
  )
}
