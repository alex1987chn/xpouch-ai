/**
 * CommandPalette - ⌘K 全局命令面板
 *
 * [定位] 全局入口：一处触达「命令」（新建会话/页面跳转/切主题）
 * 与「会话」（历史线程模糊搜索，点击直达）。
 * [交互] ↑↓ 浏览 · ⏎ 打开 · esc 关闭；打开时自动聚焦输入。
 * [形态] 顶部 15% 浮层（蓝本 .pal 语法）：输入带 + 分组列表 + 快捷键脚注。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, LayoutGrid, Layers, LineChart, Settings, Search, MessageSquare, Sun, Moon, Shapes } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { Z_INDEX } from '@/constants/zIndex'
import { useUserStore } from '@/store/userStore'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { useChatHistoryQuery } from '@/hooks/queries/useChatHistoryQuery'
import { useThemeStore, THEMES } from '@/store/themeStore'
import type { LucideIcon } from 'lucide-react'

interface CommandItem {
  id: string
  label: string
  icon: LucideIcon
  hint?: string
  run: () => void
}

interface SessionItem {
  id: string
  label: string
}

const themeIcons = { soft: Sun, dark: Moon, bauhaus: Shapes } as const

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const user = useUserStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const setTheme = useThemeStore(s => s.setTheme)
  const currentTheme = useThemeStore(s => s.theme)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  // 会话数据（与地层同一真相源，缓存友好）
  const { data } = useChatHistoryQuery({ limit: 30 })
  const conversations = useMemo(
    () => data?.pages.flatMap(page => page.items) ?? [],
    [data]
  )

  const close = () => {
    setQuery('')
    setCursor(0)
    onClose()
  }

  // 打开时聚焦并重置
  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // 命令表（跳转类带 hint）
  const commands: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      {
        id: 'new-session',
        label: t('cmdNewSession'),
        icon: Plus,
        run: () => {
          useChatStore.getState().setMessages([])
          useChatStore.getState().setCurrentConversationId(null)
          useTaskStore.getState().resetAll(true)
          navigate('/workbench')
        },
      },
      { id: 'go-workbench', label: t('workbenchTitle'), icon: LayoutGrid, hint: 'G W', run: () => navigate('/workbench') },
      { id: 'go-library', label: t('railLibrary'), icon: Layers, hint: 'G L', run: () => navigate('/library') },
    ]
    if (isAdmin) {
      items.push({ id: 'go-stats', label: t('navStats'), icon: LineChart, hint: 'G S', run: () => navigate('/admin/stats') })
      items.push({ id: 'go-admin', label: t('navConsole'), icon: Settings, hint: 'G A', run: () => navigate('/admin/console') })
    }
    for (const meta of THEMES) {
      if (meta.id === currentTheme) continue
      items.push({
        id: `theme-${meta.id}`,
        label: `${t('cmdGoTheme')} · ${meta.name}`,
        icon: themeIcons[meta.id],
        run: () => setTheme(meta.id),
      })
    }
    return items
  }, [t, navigate, isAdmin, currentTheme, setTheme])

  // 过滤
  const q = query.trim().toLowerCase()
  const filteredCommands = useMemo(
    () => (q ? commands.filter(c => c.label.toLowerCase().includes(q)) : commands),
    [commands, q]
  )
  const filteredSessions = useMemo(() => {
    if (!q) return conversations.slice(0, 8).map(c => ({ id: c.id, label: c.title || t('newChat') }))
    return conversations
      .filter(c => (c.title || '').toLowerCase().includes(q) || (c.last_message_preview || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(c => ({ id: c.id, label: c.title || t('newChat') }))
  }, [conversations, q, t])

  const flat: Array<{ kind: 'command'; item: CommandItem } | { kind: 'session'; item: SessionItem }> = useMemo(
    () => [
      ...filteredCommands.map(item => ({ kind: 'command' as const, item })),
      ...filteredSessions.map(item => ({ kind: 'session' as const, item })),
    ],
    [filteredCommands, filteredSessions]
  )

  // 越界回收
  useEffect(() => { setCursor(c => Math.min(c, Math.max(flat.length - 1, 0))) }, [flat.length])

  const runAt = (index: number) => {
    const entry = flat[index]
    if (!entry) return
    if (entry.kind === 'command') {
      entry.item.run()
    } else {
      // 与地层切换同一守卫序列：清态再跳线程
      useChatStore.getState().setMessages([])
      useChatStore.getState().setCurrentConversationId(null)
      useTaskStore.getState().resetAll(true)
      navigate(`/workbench/${entry.item.id}`)
    }
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(cursor) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  // 滚动跟随选中项
  useEffect(() => {
    listRef.current?.querySelectorAll('[data-pal-item]')[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  let index = -1

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center bg-surface-scrim/50 pt-[14vh]"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={close}
    >
      <div
        className="w-[560px] max-w-[92vw] animate-in fade-in zoom-in-95 overflow-hidden rounded-lg border border-border-default bg-surface-card shadow-theme-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* 输入带 */}
        <div className="flex h-12 items-center gap-2.5 border-b border-border-divider px-4">
          <Search className="h-4 w-4 shrink-0 text-content-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKeyDown}
            placeholder={t('cmdSearch')}
            className="flex-1 border-none bg-transparent text-sm text-content-primary outline-none ring-0 placeholder:text-content-muted"
          />
          <kbd className="rounded border border-border-divider bg-surface-page px-1.5 font-display text-[9.5px] font-bold text-content-muted">esc</kbd>
        </div>

        {/* 分组列表 */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-content-muted">{t('cmdNoResults')}</p>
          )}
          {filteredCommands.length > 0 && (
            <GroupLabel label={t('cmdGroupCommands')} />
          )}
          {filteredCommands.map(item => {
            index += 1
            const i = index
            return (
              <button
                key={item.id}
                data-pal-item
                onMouseEnter={() => setCursor(i)}
                onClick={() => runAt(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors',
                  i === cursor ? 'bg-surface-tint text-content-primary' : 'text-content-secondary hover:bg-surface-tint/60'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0 text-content-muted" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && (
                  <kbd className="rounded border border-border-divider bg-surface-page px-1.5 font-display text-[9.5px] font-bold text-content-muted">{item.hint}</kbd>
                )}
              </button>
            )
          })}
          {filteredSessions.length > 0 && (
            <GroupLabel label={t('cmdGroupSessions')} />
          )}
          {filteredSessions.map(item => {
            index += 1
            const i = index
            return (
              <button
                key={item.id}
                data-pal-item
                onMouseEnter={() => setCursor(i)}
                onClick={() => runAt(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors',
                  i === cursor ? 'bg-surface-tint text-content-primary' : 'text-content-secondary hover:bg-surface-tint/60'
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-content-muted" />
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* 脚注 */}
        <div className="border-t border-border-divider px-4 py-2 text-[11px] text-content-muted">
          {t('cmdHint')}
        </div>
      </div>
    </div>,
    document.body
  )
}

function GroupLabel({ label }: { label: string }) {
  return <div className="px-3 pb-1 pt-2 text-[11px] font-bold text-content-muted">{label}</div>
}
