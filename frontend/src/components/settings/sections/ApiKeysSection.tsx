/**
 * BYOK 分区（设置中心）：用户自带的 provider API Key。
 *
 * 明文只在保存请求出现一次（落库即加密）；界面永远只显示掩码。
 * 优先级语义：保存后该 provider 的请求走用户 key，删除即回落实例 key。
 * 布局严格沿用 SecuritySection 的分区规范（根容器/输入/按钮/行样式同款）。
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Trash2, FlaskConical } from 'lucide-react'
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

const inputCls =
  'w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2.5 text-sm transition-colors focus:border-border-focus focus:outline-none'

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
      pushToast({ title: t('byokInvalidInput') })
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
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
      {/* 分区标题（同款规范：icon + 小号粗体） */}
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-content-secondary" />
        <span className="text-xs font-bold text-content-secondary">{t('byokTitle')}</span>
      </div>
      <p className="text-caption text-content-muted leading-relaxed">{t('byokDesc')}</p>

      {!enabled && (
        <p className="rounded-md border border-accent-warning/40 bg-accent-warning/10 px-3 py-2 text-caption text-accent-warning">
          {t('byokDisabledHint')}
        </p>
      )}

      {enabled && (
        <>
          {/* 录入表单：纵向分组（同 SecuritySection 表单规范），不挤排一行 */}
          <div className="space-y-3 pt-1">
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className={inputCls}
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
              className={inputCls}
            />
            <button
              onClick={handleSave}
              disabled={saving || !provider}
              className="rounded-full border border-border-divider bg-accent-brand px-5 py-2 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              {t('byokSave')}
            </button>
          </div>

          {/* 已存列表：InfoRow 同款（label + 值 + 行内动作） */}
          {keysQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : items.length === 0 ? (
            <p className="text-caption text-content-muted">{t('byokEmpty')}</p>
          ) : (
            <div className="pt-1">
              {items.map(item => (
                <div
                  key={item.provider}
                  className="flex items-center gap-3 border-b border-border-divider py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-content-primary">
                    {item.provider}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-content-secondary">
                    {item.key_hint}
                  </span>
                  <span className="hidden w-20 shrink-0 text-right text-caption text-content-muted sm:inline">
                    {item.updated_at ? format(toLocalDate(item.updated_at), 'MM-dd HH:mm') : ''}
                  </span>
                  <button
                    onClick={() => handleTest(item.provider)}
                    disabled={testingProvider === item.provider}
                    title={t('byokTest')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary disabled:opacity-40"
                  >
                    <FlaskConical
                      className={
                        testingProvider === item.provider ? 'h-3.5 w-3.5 animate-pulse' : 'h-3.5 w-3.5'
                      }
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(item.provider)}
                    title={t('delete')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-status-offline transition-colors hover:bg-status-offline/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-caption text-content-muted">{t('byokFallbackHint')}</p>
        </>
      )}
    </div>
  )
}
