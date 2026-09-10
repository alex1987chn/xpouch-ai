/**
 * 系统状态分区（设置中心，仅管理员可见）。
 * 部署检查面：版本 / 数据库与迁移对齐 / 模型 provider / 用户分布 / 日配额。
 * 未来管理控制台落地时整体迁入，届时按功能拆分。
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, XCircle, Save } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { getSystemStatus, updateDailyTokenQuota } from '@/services/systemStatus'
import { pushToast } from '@/components/ui/use-toast'

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border-default last:border-b-0">
      <span className="text-micro font-bold uppercase tracking-widest text-content-secondary shrink-0 mt-0.5">
        {label}
      </span>
      <div className="text-sm text-content-primary text-right break-all">{children}</div>
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
      <div className="flex-1 overflow-y-auto bauhaus-scrollbar px-5 py-5 text-xs text-content-secondary">
        ...loading
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex-1 overflow-y-auto bauhaus-scrollbar px-5 py-5 text-xs text-content-secondary">
        {t('modelsLoadFailed')}
      </div>
    )
  }

  const db = data.database

  return (
    <div className="flex-1 overflow-y-auto bauhaus-scrollbar px-5 py-5 space-y-5">
      <section className="border-2 border-border-default px-3 py-1">
        <StatusRow label="Version">
          {data.version} · {data.environment}
        </StatusRow>
        <StatusRow label="Database">
          <span className="inline-flex items-center gap-1.5">
            {db.connected ? (
              <CheckCircle className="w-4 h-4 text-accent-success" />
            ) : (
              <XCircle className="w-4 h-4 text-status-offline" />
            )}
            {db.connected ? 'Connected' : 'Disconnected'}
          </span>
        </StatusRow>
        <StatusRow label="Migrations">
          <span className="inline-flex items-center gap-1.5">
            {db.up_to_date ? (
              <CheckCircle className="w-4 h-4 text-accent-success" />
            ) : (
              <XCircle className="w-4 h-4 text-status-offline" />
            )}
            {db.up_to_date
              ? t('migrationsUpToDate')
              : `${db.applied_version ?? 'N/A'} → ${db.code_head ?? 'N/A'}`}
          </span>
        </StatusRow>
        <StatusRow label="Default Model">
          {data.default_model}
        </StatusRow>
        <StatusRow label="Users">
          {data.users.total} · admin {data.users.admin}
        </StatusRow>
      </section>

      {/* 模型 Provider */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 bg-content-secondary"></div>
          <span className="text-micro font-bold uppercase tracking-widest text-content-secondary">
            Providers
          </span>
        </div>
        <div className="border-2 border-border-default px-3 py-1 space-y-0">
          {data.providers.configured.map(p => (
            <StatusRow key={p.name} label={p.display_name}>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-accent-success" />
                {p.default_model || p.env_key}
              </span>
            </StatusRow>
          ))}
          {data.providers.missing_key.map(p => (
            <StatusRow key={p.name} label={p.name}>
              <span className="inline-flex items-center gap-1.5 text-content-secondary">
                <XCircle className="w-4 h-4 text-status-offline" />
                {t('missingKey')} · {p.env_key}
              </span>
            </StatusRow>
          ))}
          {data.providers.disabled.length > 0 && (
            <StatusRow label="Disabled">
              <span className="text-content-secondary">{data.providers.disabled.join(', ')}</span>
            </StatusRow>
          )}
        </div>
      </section>

      {/* 每用户日 token 配额 */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 bg-content-secondary"></div>
          <span className="text-micro font-bold uppercase tracking-widest text-content-secondary">
            {t('dailyTokenQuota')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={quotaInput}
            onChange={e => setQuotaInput(e.target.value)}
            placeholder={t('quotaUnlimited')}
            className="flex-1 px-3 py-2 border-2 border-border-default bg-surface-page text-sm focus:outline-none focus:border-border-focus transition-colors"
          />
          <button
            onClick={handleSaveQuota}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 border-2 border-border-default bg-accent-hover text-content-primary text-xs font-bold uppercase hover:brightness-95 transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {t('save')}
          </button>
        </div>
        <p className="text-nano text-content-secondary opacity-60 mt-2">{t('quotaHint')}</p>
      </section>
    </div>
  )
}
