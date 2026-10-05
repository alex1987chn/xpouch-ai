/**
 * BYOK 分区（设置中心）：用户自带的 provider API Key。
 *
 * 明文只在保存请求出现一次（落库即加密）；界面永远只显示掩码。
 * 优先级语义：保存后该 provider 的请求走用户 key，删除即回落实例 key。
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, Trash2, FlaskConical, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from '@/i18n'
import { pushToast } from '@/components/ui/use-toast'
import { toLocalDate } from '@/lib/datetime'
import { getAvailableModels } from '@/services/models'
import {
  deleteMyApiKey,
  listMyApiKeys,
  testMyApiKey,
  upsertMyApiKey,
  type ApiKeyMeta,
} from '@/services/byok'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function ApiKeysSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)

  const keysQuery = useQuery({
    queryKey: ['byok-keys'],
    queryFn: listMyApiKeys,
    staleTime: 10_000,
  })
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: getAvailableModels, staleTime: 60_000 })

  // 可选 provider = 实例已启用模型的 provider 去重（按优先级序）
  const providers = useMemo(() => {
    const seen: string[] = []
    for (const m of modelsQuery.data ?? []) {
      if (m.provider && !seen.includes(m.provider)) seen.push(m.provider)
    }
    return seen
  }, [modelsQuery.data])

  const items: ApiKeyMeta[] = keysQuery.data?.items ?? []
  const enabled = keysQuery.data?.enabled ?? true

  const handleSave = async () => {
    if (!provider || apiKey.trim().length < 8) {
      pushToast({ title: t('byokInvalidInput'), variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await upsertMyApiKey(provider, apiKey.trim())
      pushToast({ title: t('byokSaved') })
      setApiKey('')
      await queryClient.invalidateQueries({ queryKey: ['byok-keys'] })
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: string) => {
    try {
      await deleteMyApiKey(p)
      pushToast({ title: t('byokDeleted') })
      await queryClient.invalidateQueries({ queryKey: ['byok-keys'] })
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'destructive' })
    }
  }

  const handleTest = async (p: string) => {
    setTestingProvider(p)
    try {
      const result = await testMyApiKey(p)
      pushToast({
        title: result.ok ? t('byokTestOk') : t('byokTestFail'),
        description: result.detail,
        variant: result.ok ? 'default' : 'destructive',
      })
    } catch (err) {
      pushToast({ title: (err as Error).message, variant: 'destructive' })
    } finally {
      setTestingProvider(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-content-muted" />
        <span className="text-sm font-bold text-content-primary">{t('byokTitle')}</span>
      </div>
      <p className="text-xs leading-5 text-content-secondary">{t('byokDesc')}</p>

      {!enabled && (
        <div className="rounded-md border border-accent-warning/40 bg-accent-warning/10 px-3 py-2 text-xs text-accent-warning">
          {t('byokDisabledHint')}
        </div>
      )}

      {enabled && (
        <>
          {/* 录入行 */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-border-default bg-surface-page px-2 text-xs text-content-primary"
              aria-label={t('byokProvider')}
            >
              <option value="">{t('byokProviderPlaceholder')}</option>
              {providers.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={t('byokKeyPlaceholder')}
              autoComplete="off"
              className="h-8 min-w-0 flex-[2] rounded-md border border-border-default bg-surface-page px-2 text-xs text-content-primary"
            />
            <button
              onClick={handleSave}
              disabled={saving || !provider}
              className="flex h-8 items-center gap-1 rounded-md bg-accent-brand px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('byokSave')}
            </button>
          </div>

          {/* 已存列表（掩码） */}
          {keysQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : items.length === 0 ? (
            <p className="text-xs text-content-muted">{t('byokEmpty')}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border-divider">
              {items.map(item => (
                <div
                  key={item.provider}
                  className="flex items-center gap-2 border-b border-border-divider px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-content-primary">
                    {item.provider}
                  </span>
                  <span className="font-mono text-nano text-content-secondary">
                    {item.key_hint}
                  </span>
                  <span className="hidden text-nano text-content-muted sm:inline">
                    {item.updated_at
                      ? format(toLocalDate(item.updated_at), 'MM-dd HH:mm')
                      : ''}
                  </span>
                  <button
                    onClick={() => handleTest(item.provider)}
                    disabled={testingProvider === item.provider}
                    title={t('byokTest')}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary disabled:opacity-50"
                  >
                    <FlaskConical
                      className={cn('h-3.5 w-3.5', testingProvider === item.provider && 'animate-pulse')}
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(item.provider)}
                    title={t('delete')}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-status-offline transition-colors hover:bg-status-offline/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="flex items-center gap-1 text-nano text-content-muted">
            <RefreshCw className="h-3 w-3" />
            {t('byokFallbackHint')}
          </p>
        </>
      )}
    </div>
  )
}
