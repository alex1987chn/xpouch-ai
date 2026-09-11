/**
 * 系统状态分区（设置中心 / 管理控制台，仅管理员可见）。
 * 部署检查面：版本 / 数据库与迁移对齐 / 模型 provider / 用户分布 / 日配额。
 * 布局对齐 docs/design 蓝本 stat-cards：统计卡栅格 + provider 行 + 配额编辑卡。
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@/i18n'
import { getSystemStatus, updateDailyTokenQuota } from '@/services/systemStatus'
import { pushToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

/** 统计卡（蓝本 stat-card：k 标签 / v 大数 / s 附加行） */
function StatCard({
  k,
  v,
  s,
  tone = 'muted',
}: {
  k: string
  v: string
  s?: string
  tone?: 'ok' | 'warn' | 'bad' | 'muted'
}) {
  return (
    <div className="rounded-md border border-border-divider bg-surface-card p-4">
      <div className="text-[11.5px] font-medium text-content-muted">{k}</div>
      <div className="mt-1.5 font-display text-[19px] font-bold leading-tight text-content-primary">
        {v}
      </div>
      {s && (
        <div
          className={cn(
            'mt-1 text-[11.5px]',
            tone === 'ok' && 'text-accent-success',
            tone === 'warn' && 'text-accent-warning',
            tone === 'bad' && 'text-status-offline',
            tone === 'muted' && 'text-content-muted'
          )}
        >
          {s}
        </div>
      )}
    </div>
  )
}

/** Provider 行（蓝本 mcp-row 语法：状态点 + 名称 + 明细） */
function ProviderRow({
  ok,
  name,
  detail,
}: {
  ok: boolean
  name: string
  detail: string
}) {
  return (
    <div className="mb-2.5 flex items-center gap-3 rounded-md border border-border-divider bg-surface-card px-4 py-3 last:mb-0">
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', ok ? 'bg-accent-success' : 'bg-content-muted/50')}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-content-primary">{name}</div>
        <div className="truncate text-[11.5px] text-content-muted">{detail}</div>
      </div>
    </div>
  )
}

export function SystemStatusSection() {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['system-status'],
    queryFn: getSystemStatus,
    refetchOnWindowFocus: false,
  })

  const [quotaInput, setQuotaInput] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (data) setQuotaInput(data.user_daily_token_quota ? String(data.user_daily_token_quota) : '')
  }, [data])

  const handleSaveQuota = async () => {
    const trimmed = quotaInput.trim()
    const quota = trimmed ? Number(trimmed) : null
    if (trimmed && (!Number.isInteger(quota) || (quota as number) <= 0)) {
      pushToast({ title: t('quotaInvalid'), variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await updateDailyTokenQuota(quota)
      pushToast({ title: t('quotaSaved') })
      refetch()
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-md bg-surface-tint" />
        ))}
      </div>
    )
  }
  if (isError || !data) {
    return <div className="py-6 text-xs text-content-secondary">{t('modelsLoadFailed')}</div>
  }

  const db = data.database
  const providersOk = data.providers.configured.length
  const providersTotal = data.providers.total || providersOk + data.providers.missing_key.length

  return (
    <div className="space-y-5">
      {/* 统计卡栅格（蓝本 stat-cards） */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard k={t('version')} v={data.version} s={data.environment} />
        <StatCard
          k="PostgreSQL"
          v={db.connected ? t('sbDbConnected') : t('sbDbDisconnected')}
          s={db.up_to_date ? t('migrationsUpToDate') : `${db.applied_version ?? 'N/A'} → ${db.code_head ?? 'N/A'}`}
          tone={db.connected ? 'ok' : 'bad'}
        />
        <StatCard
          k={t('modelProviders')}
          v={`${providersOk}/${providersTotal}`}
          s={data.providers.configured.map(p => p.name).join(' · ') || t('missingKey')}
          tone={providersOk === providersTotal ? 'ok' : 'warn'}
        />
        <StatCard k={t('defaultModel')} v={data.default_model} />
        <StatCard k={t('userManagement')} v={String(data.users.total)} s={`${t('administrator')} · ${data.users.admin}`} />
        <StatCard
          k={t('dailyTokenQuota')}
          v={data.user_daily_token_quota ? data.user_daily_token_quota.toLocaleString() : t('quotaUnlimited')}
          s={t('quotaHint')}
          tone="muted"
        />
      </div>

      {/* 模型 Provider 明细行 */}
      <section>
        <span className="mb-2.5 block text-xs font-bold text-content-secondary">Providers</span>
        {data.providers.configured.map(p => (
          <ProviderRow key={p.name} ok name={p.display_name} detail={p.default_model || p.env_key} />
        ))}
        {data.providers.missing_key.map(p => (
          <ProviderRow key={p.name} ok={false} name={p.name} detail={`${t('missingKey')} · ${p.env_key}`} />
        ))}
        {data.providers.disabled.length > 0 && (
          <ProviderRow ok={false} name={t('disabledProviders')} detail={data.providers.disabled.join(', ')} />
        )}
      </section>

      {/* 每用户日 token 配额（编辑） */}
      <section>
        <span className="mb-2.5 block text-xs font-bold text-content-secondary">{t('dailyTokenQuota')}</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={quotaInput}
            onChange={e => setQuotaInput(e.target.value)}
            placeholder={t('quotaUnlimited')}
            className="w-48 rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm transition-colors focus:outline-none focus:border-border-focus"
          />
          <button
            onClick={handleSaveQuota}
            disabled={saving}
            className="rounded-full border border-border-divider bg-accent-brand px-4 py-2 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50"
          >
            {saving ? t('savingUserSettings') : t('save')}
          </button>
        </div>
      </section>
    </div>
  )
}
