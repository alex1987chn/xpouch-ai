/**
 * UserAdminPanel - 用户管理（admin 面板，系统管理子菜单末位）
 *
 * [设计] 全实例用户数据表：用户 / 手机号 / 邮箱 / UUID / 注册时间 /
 * 最近登录 / 角色 / 操作。手机号服务端脱敏（列表响应永不携带完整号），
 * 行内眼睛按钮按需揭示（GET /admin/users/{id}/phone，admin only）。
 * [保护] 自己的角色不可改、自己不可删（后端同 guard，双保险）。
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Users, RefreshCw, Eye, EyeOff, Pencil, Trash2, Copy, Check, UserPlus,
} from 'lucide-react'
import { useTranslation } from '@/i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { EditUserDialog } from '@/components/admin/EditUserDialog'
import { AddUserDialog } from '@/components/admin/AddUserDialog'
import { pushToast } from '@/components/ui/use-toast'
import {
  listAdminUsers, revealUserPhone, deleteAdminUser, type AdminUser,
} from '@/services/admin'
import { toLocalDate } from '@/lib/datetime'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'

interface UserAdminPanelProps {
  searchQuery: string
}

function RoleChip({ role }: { role: string }) {
  const { t } = useTranslation()
  const isAdmin = role === 'admin'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-nano font-bold',
        isAdmin ? 'bg-accent-brand/15 text-content-primary' : 'bg-surface-tint text-content-secondary'
      )}
    >
      {isAdmin ? t('roleAdmin') : t('roleUser')}
    </span>
  )
}

function UuidCell({ id }: { id: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      pushToast({ title: t('copyFailed'), variant: 'destructive' })
    }
  }
  return (
    <button
      onClick={handleCopy}
      title={id}
      className="group flex items-center gap-1 font-mono text-nano text-content-muted transition-colors hover:text-content-primary"
    >
      {id.slice(0, 8)}…{id.slice(-4)}
      {copied ? <Check className="h-3 w-3 text-accent-success" /> : <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />}
    </button>
  )
}

function PhoneCell({ user }: { user: AdminUser }) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [showFull, setShowFull] = useState<Record<string, boolean>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  if (!user.has_phone && !user.phone_masked) {
    return <span className="text-nano text-content-muted">—</span>
  }

  const isRevealed = !!showFull[user.id] && !!revealed[user.id]

  const toggle = async () => {
    if (showFull[user.id]) {
      setShowFull(prev => ({ ...prev, [user.id]: false }))
      return
    }
    if (!revealed[user.id]) {
      setLoadingId(user.id)
      try {
        const phone = await revealUserPhone(user.id)
        setRevealed(prev => ({ ...prev, [user.id]: phone }))
        setShowFull(prev => ({ ...prev, [user.id]: true }))
      } catch (error) {
        pushToast({ title: (error as Error).message || t('revealPhoneFailed'), variant: 'destructive' })
      } finally {
        setLoadingId(null)
      }
      return
    }
    setShowFull(prev => ({ ...prev, [user.id]: true }))
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('font-mono text-xs text-content-primary', isRevealed && 'font-bold')}>
        {isRevealed ? revealed[user.id] : user.phone_masked}
      </span>
      <button
        onClick={() => void toggle()}
        disabled={loadingId === user.id}
        title={isRevealed ? t('maskPhone') : t('revealPhone')}
        className="flex h-5 w-5 items-center justify-center rounded text-content-muted transition-colors hover:text-content-primary"
      >
        {loadingId === user.id ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : isRevealed ? (
          <EyeOff className="h-3 w-3" />
        ) : (
          <Eye className="h-3 w-3" />
        )}
      </button>
    </span>
  )
}

export function UserAdminPanel({ searchQuery }: UserAdminPanelProps) {
  const { t } = useTranslation()
  const currentUserId = useUserStore(state => state.user?.id)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const [adding, setAdding] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const usersQuery = useQuery({
    queryKey: ['adminUsers'],
    queryFn: listAdminUsers,
    staleTime: 15_000,
  })
  const users = usersQuery.data ?? []

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      [u.username, u.email ?? '', u.phone_masked ?? '', u.id]
        .some(field => field.toLowerCase().includes(q))
    )
  }, [users, searchQuery])

  const handleDelete = async () => {
    if (!deleting) return
    setIsDeleting(true)
    try {
      await deleteAdminUser(deleting.id)
      pushToast({ title: t('userDeleted') })
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
    } catch (error) {
      pushToast({ title: (error as Error).message || t('userDeleteFailed'), variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const dateFmt = 'yyyy-MM-dd'

  return (
    <div className="flex flex-col gap-3">
      {/* 概要行 */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-content-secondary">
          <Users className="h-3.5 w-3.5" />
          {t('userCount', { count: filtered.length })}
        </span>
        <span className="flex-1" />
        <button
          onClick={() => setAdding(true)}
          className="flex h-7 items-center gap-1.5 rounded-full border border-border-divider bg-surface-card px-3 text-xs font-medium text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
        >
         <UserPlus className="h-3.5 w-3.5" />
         {t('addUser')}
        </button>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })}
          disabled={usersQuery.isLoading}
          title={t('refresh')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', usersQuery.isFetching && 'animate-spin')} />
        </button>
      </div>

      {/* 数据表 */}
      <div className="overflow-hidden rounded-lg border border-border-divider bg-surface-card">
        {usersQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState variant="bare" dense icon={Users} title={t('userNoMatch')} description={t('tryOtherKeywords')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-divider">
                  {(['colUser', 'colPhone', 'colEmail', 'colUuid', 'colCreatedAt', 'colLastLogin', 'colRole', 'colActions'] as const).map(key => (
                    <th key={key} className="px-4 py-2.5 text-nano font-bold text-content-muted">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => {
                  const isSelf = user.id === currentUserId
                  return (
                    <tr key={user.id} className="border-t border-border-divider transition-colors first:border-t-0 hover:bg-surface-tint/40">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          {user.avatar ? (
                            <img src={user.avatar} alt="" className="h-[26px] w-[26px] rounded-full border border-border-divider object-cover" />
                          ) : (
                            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-surface-tint text-xs font-bold text-content-primary">
                              {(user.username || 'U').charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="max-w-[140px] truncate text-[13px] font-bold text-content-primary">
                            {user.username}
                            {isSelf && <span className="ml-1 font-normal text-content-muted">({t('selfTag')})</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><PhoneCell user={user} /></td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-content-secondary">
                        {user.email || <span className="text-content-muted">—</span>}
                      </td>
                      <td className="px-4 py-2.5"><UuidCell id={user.id} /></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-content-secondary">
                        {user.created_at ? format(toLocalDate(user.created_at), dateFmt) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-content-secondary">
                        {user.last_login_at ? format(toLocalDate(user.last_login_at), dateFmt) : <span className="text-content-muted">—</span>}
                      </td>
                      <td className="px-4 py-2.5"><RoleChip role={user.role} /></td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => setEditing(user)}
                            title={t('edit')}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleting(user)}
                            disabled={isSelf}
                            title={isSelf ? t('selfDeleteLockedHint') : t('delete')}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-status-offline transition-colors hover:bg-status-offline/10 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddUserDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })}
      />

      <EditUserDialog
        open={!!editing}
        user={editing}
        isSelf={editing?.id === currentUserId}
        onClose={() => setEditing(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })}
      />

      <DeleteConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('userDeleteTitle')}
        description={t('userDeleteWarning', { name: deleting?.username ?? '' })}
        confirmText={isDeleting ? t('deleting') : t('confirmDelete')}
        isDeleting={isDeleting}
        variant="danger"
      />
    </div>
  )
}

export default UserAdminPanel
