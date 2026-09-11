import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { PermissionLockCard } from '@/components/ui/lock-card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { PillSwitch } from '@/pages/library/components/MCPCard'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import {
 getToolPolicies,
 type ToolPolicyRecord,
 updateToolPolicy,
} from '@/services/admin'

interface ToolGovernancePanelProps {
 searchQuery: string
 /** 是否可查看该 Tab（admin） */
 canView: boolean
 /** 是否可编辑策略（admin） */
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
 const [editing, setEditing] = useState(false)

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
  setEditing(true)
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
   <PermissionLockCard
    title={t('adminOnly')}
    description={t('governanceAdminOnly') || 'Tool governance is available to admins only.'}
   />
  )
 }

 if (isLoading) {
  return (
   <div className="space-y-2.5">
    {Array.from({ length: 6 }, (_, i) => (
     <Skeleton key={i} className="h-16 w-full rounded-md" />
    ))}
   </div>
  )
 }

 // ===== 行列表视图（默认）：策略行卡 =====
 if (!editing) {
  return (
   <div>
    {filteredPolicies.length > 0 ? (
     <div className="space-y-2.5">
      {filteredPolicies.map(policy => (
       <button
        key={`${policy.source}:${policy.tool_name}`}
        onClick={() => handleSelect(policy)}
        className="group flex w-full items-center gap-3 rounded-md border border-border-divider bg-surface-card px-4 py-3 text-left transition-all hover:border-border-hover hover:shadow-theme-card"
       >
        <div className="min-w-0 flex-1">
         <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-bold text-content-primary">
           {policy.tool_name}
          </span>
          {policy.approval_required ? (
           <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-warning/10 px-2 py-0.5 text-nano font-medium text-accent-warning">
            <span className="h-1 w-1 animate-pulse rounded-full bg-accent-warning" />
            {t('approvalRequired') || 'Approval'}
           </span>
          ) : (
           <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-online/10 px-2 py-0.5 text-nano font-medium text-status-online">
            <span className="h-1 w-1 rounded-full bg-status-online" />
            {t('autoAllowed') || 'Auto'}
           </span>
          )}
         </div>
         <div className="mt-0.5 truncate text-[11.5px] text-content-muted">
          {policy.description || policy.policy_note || '—'}
         </div>
        </div>
        <span className="shrink-0 text-nano text-content-muted">
         {policy.source} · {policy.risk_tier}
        </span>
       </button>
      ))}
     </div>
    ) : (
     <EmptyState
      variant="bare"
      dense
      title={t('noToolPoliciesFound') || 'No tool policies found'}
     />
    )}
   </div>
  )
 }

 // ===== 编辑视图：点进策略行 =====
 return (
  <div>
   <button
    onClick={() => setEditing(false)}
    className="mb-3 flex w-fit items-center gap-1.5 rounded-full border border-border-divider bg-surface-card px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
   >
    <ArrowLeft className="h-3.5 w-3.5" />
    {t('toolGovernance') || 'Tool Governance'}
   </button>
   <div className="border-theme-card border-border-default bg-surface-card shadow-theme-card">
    {selectedPolicy && draft ? (
     <>
      <div className="flex items-center justify-between gap-3 border-b border-border-divider px-5 py-3.5">
       <div className="min-w-0">
        <div className="flex items-center gap-2">
         <span className="truncate text-sm font-bold text-content-primary">
          {selectedPolicy.tool_name}
         </span>
         {draft.approval_required ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-warning/10 px-2 py-0.5 text-nano font-medium text-accent-warning">
           <span className="h-1 w-1 animate-pulse rounded-full bg-accent-warning" />
           {t('approvalRequired') || 'Approval'}
          </span>
         ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-online/10 px-2 py-0.5 text-nano font-medium text-status-online">
           <span className="h-1 w-1 rounded-full bg-status-online" />
           {t('autoAllowed') || 'Auto'}
          </span>
         )}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-content-muted">
         {selectedPolicy.description || '—'}
        </div>
       </div>
       <span className="shrink-0 text-nano text-content-muted">
        {selectedPolicy.source} · {selectedPolicy.risk_tier}
       </span>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2">
       <Field label={t('riskTier') || 'Risk Tier'}>
        <div className="flex h-[34px] w-fit items-center overflow-hidden rounded-full border border-border-default bg-surface-page disabled:opacity-60">
         {(['low', 'medium', 'high'] as const).map((tier, i) => (
          <button
           key={tier}
           type="button"
           disabled={!canEdit}
           onClick={() => setDraft(prev => prev ? { ...prev, risk_tier: tier } : prev)}
           className={cn(
            'h-full px-4 text-xs transition-colors',
            i > 0 && 'border-l border-border-divider',
            draft.risk_tier === tier
             ? 'bg-surface-tint font-bold text-content-primary'
             : 'text-content-muted hover:text-content-primary'
           )}
          >
           {tier === 'low' ? (t('riskLow') || 'Low') : tier === 'medium' ? (t('riskMedium') || 'Medium') : (t('riskHigh') || 'High')}
          </button>
         ))}
        </div>
       </Field>
       <Field label={t('enabled') || 'Enabled'}>
        <div className="flex h-[34px] items-center gap-2.5">
         <PillSwitch
          on={draft.enabled}
          disabled={!canEdit}
          onToggle={() => setDraft(prev => prev ? { ...prev, enabled: !prev.enabled } : prev)}
         />
         <span className="text-xs text-content-secondary">
          {draft.enabled ? t('enabled') || 'Enabled' : t('disabled') || 'Disabled'}
         </span>
        </div>
       </Field>
       <Field label={t('approvalRequired') || 'Approval Required'}>
        <div className="flex h-[34px] items-center gap-2.5">
         <PillSwitch
          on={draft.approval_required}
          disabled={!canEdit}
          onToggle={() => setDraft(prev => prev ? { ...prev, approval_required: !prev.approval_required } : prev)}
         />
         <span className="text-xs text-content-secondary">
          {draft.approval_required ? t('approvalRequired') || 'Approval Required' : t('autoAllowed') || 'Auto Allowed'}
         </span>
        </div>
       </Field>
       <Field label={t('allowedExperts') || 'Allowed Experts'} className="md:col-span-2">
        <input
         value={draft.allowed_experts}
         disabled={!canEdit}
         onChange={e => setDraft(prev => prev ? { ...prev, allowed_experts: e.target.value } : prev)}
         placeholder="planner, search"
         className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus disabled:opacity-60"
        />
       </Field>
       <Field label={t('blockedExperts') || 'Blocked Experts'} className="md:col-span-2">
        <input
         value={draft.blocked_experts}
         disabled={!canEdit}
         onChange={e => setDraft(prev => prev ? { ...prev, blocked_experts: e.target.value } : prev)}
         placeholder="memorize_expert"
         className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus disabled:opacity-60"
        />
       </Field>
       <Field label={t('policyNote') || 'Policy Note'} className="md:col-span-2">
        <textarea
         rows={4}
         value={draft.policy_note}
         disabled={!canEdit}
         onChange={e => setDraft(prev => prev ? { ...prev, policy_note: e.target.value } : prev)}
         className="w-full resize-y rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus disabled:opacity-60"
        />
       </Field>
      </div>

      {canEdit && (
       <div className="flex justify-end border-t border-border-divider px-4 py-3">
        <button
         onClick={() => void handleSave()}
         disabled={isSaving}
         className="flex items-center gap-2 rounded-full border border-border-divider bg-accent-brand px-4 py-2 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
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
   <div className="text-micro font-bold tracking-widest text-content-secondary">
    {label}
   </div>
   {children}
  </div>
 )
}

export default ToolGovernancePanel
