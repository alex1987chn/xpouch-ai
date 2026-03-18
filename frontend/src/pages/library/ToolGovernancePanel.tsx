import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Lock, Save, ShieldAlert } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import {
  getToolPolicies,
  type ToolPolicyRecord,
  updateToolPolicy,
} from '@/services/admin'

interface ToolGovernancePanelProps {
  searchQuery: string
  /** 是否可查看该 Tab（admin / edit_admin / view_admin） */
  canView: boolean
  /** 是否可编辑策略（admin / edit_admin） */
  canEdit: boolean
}

interface PolicyDraft {
  enabled: boolean
  risk_tier: 'low' | 'medium' | 'high'
  approval_required: boolean
  allowed_experts: string
  blocked_experts: string
  policy_note: string
}

function draftFromPolicy(policy: ToolPolicyRecord): PolicyDraft {
  return {
    enabled: policy.enabled,
    risk_tier: policy.risk_tier,
    approval_required: policy.approval_required,
    allowed_experts: (policy.allowed_experts ?? []).join(', '),
    blocked_experts: (policy.blocked_experts ?? []).join(', '),
    policy_note: policy.policy_note ?? '',
  }
}

function splitCsv(value: string): string[] | null {
  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : null
}

export function ToolGovernancePanel({ searchQuery, canView, canEdit }: ToolGovernancePanelProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const tRef = useRef(t)
  const toastRef = useRef(toast)
  const [policies, setPolicies] = useState<ToolPolicyRecord[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<PolicyDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    tRef.current = t
    toastRef.current = toast
  }, [t, toast])

  const applyPolicies = (
    data: ToolPolicyRecord[],
    preferredSelectedKey: string | null = null
  ) => {
    setPolicies(data)
    if (data.length === 0) {
      setSelectedKey(null)
      setDraft(null)
      return
    }

    const nextSelectedKey =
      preferredSelectedKey &&
      data.some(policy => `${policy.source}:${policy.tool_name}` === preferredSelectedKey)
        ? preferredSelectedKey
        : `${data[0].source}:${data[0].tool_name}`
    const nextSelected =
      data.find(policy => `${policy.source}:${policy.tool_name}` === nextSelectedKey) ?? data[0]
    setSelectedKey(nextSelectedKey)
    setDraft(draftFromPolicy(nextSelected))
  }

  const refreshPolicies = async (preferredSelectedKey: string | null = null) => {
    setIsLoading(true)
    try {
      const data = await getToolPolicies()
      applyPolicies(data.policies, preferredSelectedKey)
    } catch (error) {
      toastRef.current({
        title: tRef.current('loadFailed') || 'Load failed',
        description: error instanceof Error ? error.message : tRef.current('loadFailed'),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      if (!canView) {
        setPolicies([])
        setSelectedKey(null)
        setDraft(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const data = await getToolPolicies()
        if (cancelled) return
        applyPolicies(data.policies)
      } catch (error) {
        if (cancelled) return
        toastRef.current({
          title: tRef.current('loadFailed') || 'Load failed',
          description: error instanceof Error ? error.message : tRef.current('loadFailed'),
          variant: 'destructive',
        })
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    if (canView) {
      void bootstrap()
    } else {
      setPolicies([])
      setSelectedKey(null)
      setDraft(null)
      setIsLoading(false)
    }
    return () => {
      cancelled = true
    }
  }, [canView])

  const filteredPolicies = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    if (!keyword) return policies
    return policies.filter(policy =>
      [policy.tool_name, policy.description, policy.source, policy.policy_note]
        .filter(Boolean)
        .some(value => value?.toLowerCase().includes(keyword))
    )
  }, [policies, searchQuery])

  const selectedPolicy = policies.find(
    policy => `${policy.source}:${policy.tool_name}` === selectedKey
  ) ?? null

  const handleSelect = (policy: ToolPolicyRecord) => {
    setSelectedKey(`${policy.source}:${policy.tool_name}`)
    setDraft(draftFromPolicy(policy))
  }

  const handleSave = async () => {
    if (!selectedPolicy || !draft) return
    setIsSaving(true)
    try {
      await updateToolPolicy(selectedPolicy.source, selectedPolicy.tool_name, {
        enabled: draft.enabled,
        risk_tier: draft.risk_tier,
        approval_required: draft.approval_required,
        allowed_experts: splitCsv(draft.allowed_experts),
        blocked_experts: splitCsv(draft.blocked_experts),
        policy_note: draft.policy_note || null,
      })
      toast({
        title: t('saved') || 'Saved',
        description: t('policySaved') || 'Policy updated successfully.',
      })
      await refreshPolicies(`${selectedPolicy.source}:${selectedPolicy.tool_name}`)
    } catch (error) {
      toast({
        title: t('saveFailed') || 'Save failed',
        description: error instanceof Error ? error.message : t('saveFailed'),
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!canView) {
    return (
      <div className="border-2 border-border-default bg-surface-card px-6 py-16 text-center shadow-theme-card">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-2 border-border-default bg-surface-page">
          <Lock className="h-8 w-8 text-content-muted" />
        </div>
        <h3 className="font-mono text-sm font-bold uppercase text-content-primary">
          {t('adminOnly') || 'Admin only'}
        </h3>
        <p className="mt-2 text-xs text-content-secondary">
          {t('governanceAdminOnly') || 'Tool governance is available to admins only.'}
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="text-center py-20 font-mono text-sm uppercase text-content-muted">
        {t('loading') || 'Loading...'}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="border-2 border-border-default bg-surface-card shadow-theme-card">
        <div className="border-b-2 border-border-default px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-content-secondary" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
              {t('toolGovernance') || 'Tool Governance'}
            </span>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto bauhaus-scrollbar">
          {filteredPolicies.map(policy => (
            <button
              key={`${policy.source}:${policy.tool_name}`}
              onClick={() => handleSelect(policy)}
              className={cn(
                'w-full border-b-2 border-border-default px-4 py-3 text-left transition-all relative',
                selectedKey === `${policy.source}:${policy.tool_name}`
                  ? 'bg-surface-elevated border-l-4 border-l-accent-brand pl-3'
                  : 'bg-surface-card hover:bg-surface-page border-l-4 border-l-transparent'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold uppercase text-content-primary">
                  {policy.tool_name}
                </span>
                <span className="text-[9px] uppercase text-content-muted">{policy.source}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] uppercase text-content-secondary">
                <span>{policy.risk_tier}</span>
                <span>/</span>
                <span>{policy.approval_required ? t('approvalRequired') || 'Approval' : t('autoAllowed') || 'Auto'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="border-2 border-border-default bg-surface-card shadow-theme-card">
        {selectedPolicy && draft ? (
          <>
            <div className="flex items-center justify-between border-b-2 border-border-default px-4 py-3">
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                  {selectedPolicy.tool_name}
                </div>
                <div className="mt-1 text-xs text-content-muted">{selectedPolicy.description}</div>
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase text-content-secondary">
                <Check className="h-3.5 w-3.5" />
                {selectedPolicy.source}
              </div>
            </div>

            <div className="grid gap-4 p-4 md:grid-cols-2">
              <Field label={t('riskTier') || 'Risk Tier'}>
                <select
                  value={draft.risk_tier}
                  disabled={!canEdit}
                  onChange={e => setDraft(prev => prev ? { ...prev, risk_tier: e.target.value as PolicyDraft['risk_tier'] } : prev)}
                  className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong disabled:opacity-60"
                >
                  <option value="low">{t('riskLow') || 'Low'}</option>
                  <option value="medium">{t('riskMedium') || 'Medium'}</option>
                  <option value="high">{t('riskHigh') || 'High'}</option>
                </select>
              </Field>
              <Field label={t('enabled') || 'Enabled'}>
                <label className="flex h-[42px] items-center gap-2 border-2 border-border-default bg-surface-page px-3 text-sm text-content-primary">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    disabled={!canEdit}
                    onChange={e => setDraft(prev => prev ? { ...prev, enabled: e.target.checked } : prev)}
                  />
                  {draft.enabled ? t('enabled') || 'Enabled' : t('disabled') || 'Disabled'}
                </label>
              </Field>
              <Field label={t('approvalRequired') || 'Approval Required'}>
                <label className="flex h-[42px] items-center gap-2 border-2 border-border-default bg-surface-page px-3 text-sm text-content-primary">
                  <input
                    type="checkbox"
                    checked={draft.approval_required}
                    disabled={!canEdit}
                    onChange={e => setDraft(prev => prev ? { ...prev, approval_required: e.target.checked } : prev)}
                  />
                  {draft.approval_required ? t('approvalRequired') || 'Approval Required' : t('autoAllowed') || 'Auto Allowed'}
                </label>
              </Field>
              <Field label={t('source') || 'Source'}>
                <div className="flex h-[42px] items-center border-2 border-border-default bg-surface-page px-3 text-sm text-content-secondary">
                  {selectedPolicy.source}
                </div>
              </Field>
              <Field label={t('allowedExperts') || 'Allowed Experts'} className="md:col-span-2">
                <input
                  value={draft.allowed_experts}
                  disabled={!canEdit}
                  onChange={e => setDraft(prev => prev ? { ...prev, allowed_experts: e.target.value } : prev)}
                  placeholder="planner, search"
                  className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong disabled:opacity-60"
                />
              </Field>
              <Field label={t('blockedExperts') || 'Blocked Experts'} className="md:col-span-2">
                <input
                  value={draft.blocked_experts}
                  disabled={!canEdit}
                  onChange={e => setDraft(prev => prev ? { ...prev, blocked_experts: e.target.value } : prev)}
                  placeholder="memorize_expert"
                  className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong disabled:opacity-60"
                />
              </Field>
              <Field label={t('policyNote') || 'Policy Note'} className="md:col-span-2">
                <textarea
                  rows={4}
                  value={draft.policy_note}
                  disabled={!canEdit}
                  onChange={e => setDraft(prev => prev ? { ...prev, policy_note: e.target.value } : prev)}
                  className="w-full resize-y border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong disabled:opacity-60"
                />
              </Field>
            </div>

            {canEdit && (
              <div className="flex justify-end border-t-2 border-border-default px-4 py-3">
                <button
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="flex items-center gap-2 border-2 border-border-default bg-surface-elevated px-3 py-2 font-mono text-[10px] font-bold uppercase text-content-primary transition-colors hover:border-border-strong disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? t('saving') || 'Saving' : t('savePolicy') || 'Save Policy'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="px-6 py-16 text-center text-content-muted">
            {t('noToolPolicySelected') || 'Select a tool policy to edit.'}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
        {label}
      </div>
      {children}
    </div>
  )
}

export default ToolGovernancePanel
