import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bot, FileCode, Plus, Rocket, Save, Trash2, Upload, Download, Link2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/ui/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import {
 createSkillTemplate,
 deleteSkillTemplate,
 getSkillTemplates,
 type SkillTemplate,
 updateSkillTemplate,
 exportSkillTemplate,
 shareSkillTemplate,
} from '@/services/admin'
import { TemplateImportDialog } from '@/components/library/TemplateImportDialog'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'

// Artifact 类型标签颜色映射（半透明色底 + 主题感知前景，双主题通用）
const ARTIFACT_TYPE_COLORS: Record<string, string> = {
 markdown: 'bg-accent-success/15 text-content-primary',
 code: 'bg-accent-info/15 text-content-primary',
 html: 'bg-accent-warning/15 text-content-primary',
 text: 'bg-surface-elevated text-content-primary',
 image: 'bg-accent-destructive/15 text-content-primary',
}

interface SkillTemplatePanelProps {
 searchQuery: string
 /** 是否可编辑模板（新建/编辑/删除），仅 admin */
 canEdit: boolean
}

interface TemplateDraft {
 id?: string
 template_key: string
 name: string
 description: string
 category: string
 starter_prompt: string
 system_hint: string
 recommended_mode: 'simple' | 'complex'
 suggested_tags: string
 tool_hints: string
 expected_artifact_types: string
 artifact_schema_hint: string
 is_active: boolean
 is_builtin: boolean
}

const EMPTY_DRAFT: TemplateDraft = {
 template_key: '',
 name: '',
 description: '',
 category: 'general',
 starter_prompt: '',
 system_hint: '',
 recommended_mode: 'complex',
 suggested_tags: '',
 tool_hints: '',
 expected_artifact_types: '',
 artifact_schema_hint: '',
 is_active: true,
 is_builtin: false,
}

function draftFromTemplate(template: SkillTemplate): TemplateDraft {
 return {
  id: template.id,
  template_key: template.template_key,
  name: template.name,
  description: template.description ?? '',
  category: template.category,
  starter_prompt: template.starter_prompt,
  system_hint: template.system_hint ?? '',
  recommended_mode: template.recommended_mode,
  suggested_tags: (template.suggested_tags ?? []).join(', '),
  tool_hints: (template.tool_hints ?? []).join(', '),
  expected_artifact_types: (template.expected_artifact_types ?? []).join(', '),
  artifact_schema_hint: template.artifact_schema_hint ?? '',
  is_active: template.is_active,
  is_builtin: template.is_builtin,
 }
}

function splitCsv(value: string): string[] | null {
 const items = value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)
 return items.length > 0 ? items : null
}

export function SkillTemplatePanel({ searchQuery, canEdit }: SkillTemplatePanelProps) {
 const { t } = useTranslation()
 const { toast } = useToast()
 const navigate = useNavigate()
 const tRef = useRef(t)
 const toastRef = useRef(toast)
 const [templates, setTemplates] = useState<SkillTemplate[]>([])
 const [selectedId, setSelectedId] = useState<string | null>(null)
 const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT)
 const [isLoading, setIsLoading] = useState(true)
 const [isSaving, setIsSaving] = useState(false)
 const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
 const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
 const [isDeleting, setIsDeleting] = useState(false)

 useEffect(() => {
  tRef.current = t
  toastRef.current = toast
 }, [t, toast])

 const applyTemplates = (
  data: SkillTemplate[],
  preferredSelectedId: string | null = null
 ) => {
  setTemplates(data)
  if (data.length === 0) {
   setSelectedId(null)
   setDraft(EMPTY_DRAFT)
   return
  }

  const nextSelectedId =
   preferredSelectedId && data.some(item => item.id === preferredSelectedId)
    ? preferredSelectedId
    : data[0].id
  const nextSelected = data.find(item => item.id === nextSelectedId) ?? data[0]
  setSelectedId(nextSelected.id)
  setDraft(draftFromTemplate(nextSelected))
 }

 const refreshTemplates = async (preferredSelectedId: string | null = null) => {
  setIsLoading(true)
  try {
   const data = await getSkillTemplates(canEdit)
   applyTemplates(data, preferredSelectedId)
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
   setIsLoading(true)
   try {
    const data = await getSkillTemplates(canEdit)
    if (cancelled) return
    applyTemplates(data)
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

  void bootstrap()
  return () => {
   cancelled = true
  }
 }, [canEdit])

 const filteredTemplates = useMemo(() => {
  const keyword = searchQuery.trim().toLowerCase()
  if (!keyword) {
   return templates
  }
  return templates.filter(template =>
   [template.name, template.description, template.category, template.template_key]
    .filter(Boolean)
    .some(value => value?.toLowerCase().includes(keyword))
  )
 }, [searchQuery, templates])

 const selectedTemplate = templates.find(item => item.id === selectedId) ?? null
 const isReadonly = !canEdit

 const handleSelect = (template: SkillTemplate) => {
  setSelectedId(template.id)
  setDraft(draftFromTemplate(template))
 }

 const handleCreate = () => {
  setSelectedId(null)
  setDraft(EMPTY_DRAFT)
 }

 const handleUseTemplate = (template: SkillTemplate) => {
  navigate(`/workbench/${crypto.randomUUID()}`, {
   state: {
    isNew: true,
    startWith: template.starter_prompt,
   },
  })
 }

 const handleSave = async () => {
  if (!draft.template_key.trim() || !draft.name.trim() || !draft.starter_prompt.trim()) {
   toast({
    title: t('validationError') || 'Validation error',
    description: t('templateRequiredFields') || 'Key, name, and prompt are required.',
    variant: 'destructive',
   })
   return
  }
  setIsSaving(true)
  try {
   if (draft.id) {
    await updateSkillTemplate(draft.id, {
     name: draft.name,
     description: draft.description || null,
     category: draft.category,
     starter_prompt: draft.starter_prompt,
     system_hint: draft.system_hint || null,
     recommended_mode: draft.recommended_mode,
     suggested_tags: splitCsv(draft.suggested_tags),
     tool_hints: splitCsv(draft.tool_hints),
     expected_artifact_types: splitCsv(draft.expected_artifact_types),
     artifact_schema_hint: draft.artifact_schema_hint || null,
     is_active: draft.is_active,
    })
   } else {
    await createSkillTemplate({
     template_key: draft.template_key,
     name: draft.name,
     description: draft.description || null,
     category: draft.category,
     starter_prompt: draft.starter_prompt,
     system_hint: draft.system_hint || null,
     recommended_mode: draft.recommended_mode,
     suggested_tags: splitCsv(draft.suggested_tags),
     tool_hints: splitCsv(draft.tool_hints),
     expected_artifact_types: splitCsv(draft.expected_artifact_types),
     artifact_schema_hint: draft.artifact_schema_hint || null,
     is_active: draft.is_active,
    })
   }
   toast({
    title: t('saved') || 'Saved',
    description: t('templateSaved') || 'Template saved successfully.',
   })
   await refreshTemplates(draft.id ?? null)
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

 const handleDeleteClick = () => {
  if (!draft.id) return
  if (draft.is_builtin) {
   toast({
    title: t('deleteFailed') || 'Delete failed',
    description: t('builtinTemplateCannotDelete') || 'Builtin templates cannot be deleted.',
    variant: 'destructive',
   })
   return
  }
  setIsDeleteDialogOpen(true)
 }

 const handleConfirmDelete = async () => {
  if (!draft.id) return
  setIsDeleting(true)
  try {
   await deleteSkillTemplate(draft.id)
   toast({
    title: t('deleted') || 'Deleted',
    description: t('templateDeleted') || 'Template deleted successfully.',
   })
   setIsDeleteDialogOpen(false)
   await refreshTemplates()
  } catch (error) {
   toast({
    title: t('deleteFailed') || 'Delete failed',
    description: error instanceof Error ? error.message : t('deleteFailed'),
    variant: 'destructive',
   })
  } finally {
   setIsDeleting(false)
  }
 }

 const handleShare = async () => {
  if (!selectedTemplate || !canEdit) return
  try {
   const res = await shareSkillTemplate(selectedTemplate.template_key)
   const url = `${window.location.origin}${res.path}`
   await navigator.clipboard.writeText(url)
   toast({
    title: t('templateShareCopied') || 'Share link copied',
    description: t('templateShareHint') || 'Anyone with the link can fetch this template JSON for import.',
   })
  } catch (error) {
   toast({
    title: t('templateShareFailed') || 'Share failed',
    description: error instanceof Error ? error.message : t('templateShareFailed'),
    variant: 'destructive',
   })
  }
 }

 const handleExport = async () => {
  if (!selectedTemplate) return
  try {
   const exportData = await exportSkillTemplate(selectedTemplate.template_key)
   const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
   const url = URL.createObjectURL(blob)
   const a = document.createElement('a')
   a.href = url
   a.download = `${selectedTemplate.template_key}-template.json`
   document.body.appendChild(a)
   a.click()
   document.body.removeChild(a)
   URL.revokeObjectURL(url)
   toast({
    title: t('exported') || 'Exported',
    description: t('templateExported') || 'Template exported successfully.',
   })
  } catch (error) {
   toast({
    title: t('exportFailed') || 'Export failed',
    description: error instanceof Error ? error.message : t('exportFailed'),
    variant: 'destructive',
   })
  }
 }

 const handleImportSuccess = () => {
  void refreshTemplates()
  setIsImportDialogOpen(false)
 }

 if (isLoading) {
  // 与下方两栏布局同构：左侧模板列表 + 右侧详情
  return (
   <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
    <div className="border-theme-card border-border-default bg-surface-card shadow-theme-card">
     <div className="border-b border-border-divider px-4 py-3">
      <Skeleton className="h-3.5 w-32" />
     </div>
     <div className="p-3 space-y-2">
      {Array.from({ length: 6 }, (_, i) => (
       <Skeleton key={i} className="h-14 w-full" />
      ))}
     </div>
    </div>
    <div className="border-theme-card border-border-default bg-surface-card shadow-theme-card p-4 space-y-3">
     <Skeleton className="h-5 w-1/3" />
     <Skeleton className="h-3 w-2/3" />
     <Skeleton className="h-40 w-full" />
     <Skeleton className="h-3 w-1/2" />
    </div>
   </div>
  )
 }

 return (
  <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
   <div className="border-theme-card border-border-default bg-surface-card shadow-theme-card">
    <div className="flex items-center justify-between border-b border-border-divider px-4 py-3">
     <div className="flex items-center gap-2">
      <Bot className="h-4 w-4 text-content-secondary" />
      <span className="text-xs font-bold text-content-secondary">
       {t('skillTemplates') || 'Skill Templates'}
      </span>
     </div>
     <div className="flex items-center gap-2">
      {canEdit && (
       <>
        <button
         onClick={() => setIsImportDialogOpen(true)}
         className="flex items-center gap-1 rounded-md border-theme-button border-border-default bg-surface-page px-2 py-1 text-xs font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
         title={t('importTemplate') || 'Import'}
        >
         <Upload className="h-3.5 w-3.5" />
        </button>
        <button
         onClick={handleCreate}
         className="flex items-center gap-1 rounded-md border-theme-button border-border-default bg-surface-page px-2 py-1 text-xs font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
        >
         <Plus className="h-3.5 w-3.5" />
         {t('newTemplate') || 'New'}
        </button>
       </>
      )}
     </div>
    </div>

    {filteredTemplates.length > 0 ? (
     <div className="overflow-y-auto">
      {filteredTemplates.map((template, index) => (
       <button
        key={template.id}
        onClick={() => handleSelect(template)}
        style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        className={cn(
         'stagger-item w-full border-b border-border-divider px-4 py-3 text-left transition-all relative',
         selectedId === template.id
          ? 'bg-surface-tint border-l-2 border-l-accent-brand pl-3'
          : 'bg-surface-card hover:bg-surface-page border-l-4 border-l-transparent'
        )}
       >
        <div className="flex items-center justify-between gap-2">
         <span className="truncate text-xs font-bold text-content-primary">
          {template.name}
         </span>
         <span className="shrink-0 rounded-full bg-surface-tint px-2 py-0.5 text-nano font-medium text-content-secondary">
          {template.recommended_mode}
         </span>
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-content-secondary">
         {template.description || t('templateNoDescription') || 'No description'}
        </p>
        {template.expected_artifact_types && template.expected_artifact_types.length > 0 && (
         <div className="mt-2 flex flex-wrap gap-1">
          {template.expected_artifact_types.map(type => (
           <span
            key={type}
            className={cn(
             'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-nano',
             ARTIFACT_TYPE_COLORS[type] || 'bg-surface-elevated text-content-primary'
            )}
           >
            <FileCode className="h-2.5 w-2.5" />
            {type}
           </span>
          ))}
         </div>
        )}
       </button>
      ))}
     </div>
    ) : (
     <div className="px-4 py-12 text-center">
      <p className="text-xs text-content-muted">
       {t('noTemplatesFound') || 'No templates found'}
      </p>
     </div>
    )}
   </div>

   <div className="border-theme-card border-border-default bg-surface-card shadow-theme-card">
    <div className="flex items-center justify-between border-b border-border-divider px-4 py-3">
     <div>
      <div className="text-xs font-bold text-content-secondary">
       {draft.id ? t('templateDetail') || 'Template Detail' : t('createTemplate') || 'Create Template'}
      </div>
      <div className="mt-1 text-xs text-content-muted">
       {draft.id ? selectedTemplate?.template_key : t('templateEditorHint') || 'Build a reusable starter flow.'}
      </div>
     </div>
     <div className="flex items-center gap-2">
      {selectedTemplate && canEdit && (
       <>
        <button
         onClick={handleShare}
         className="flex items-center gap-2 rounded-full border border-border-divider bg-surface-page px-3 py-1.5 text-xs font-bold text-content-secondary transition-all hover:border-border-hover hover:text-content-primary"
         title={t('shareTemplate') || 'Share link'}
        >
         <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
         onClick={handleExport}
         className="flex items-center gap-2 rounded-full border border-border-divider bg-surface-page px-3 py-1.5 text-xs font-bold text-content-secondary transition-all hover:border-border-hover hover:text-content-primary"
         title={t('exportTemplate') || 'Export'}
        >
         <Download className="h-3.5 w-3.5" />
        </button>
       </>
      )}
      {selectedTemplate && (
       <button
        onClick={() => handleUseTemplate(selectedTemplate)}
        className="flex items-center gap-2 rounded-full border border-border-divider bg-accent-brand px-3.5 py-1.5 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card"
       >
        <Rocket className="h-3.5 w-3.5" />
        {t('useTemplate') || 'Use'}
       </button>
      )}
     </div>
    </div>

    <div className="grid gap-4 p-4 md:grid-cols-2">
     <Field label={t('templateKey') || 'Template Key'}>
      <input
       value={draft.template_key}
       disabled={Boolean(draft.id) || isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, template_key: e.target.value }))}
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus disabled:opacity-60"
      />
     </Field>
     <Field label={t('moduleName') || 'Name'}>
      <input
       value={draft.name}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
     <Field label={t('category') || 'Category'}>
      <input
       value={draft.category}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, category: e.target.value }))}
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
     <Field label={t('recommendedMode') || 'Recommended Mode'}>
      <select
       value={draft.recommended_mode}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, recommended_mode: e.target.value as 'simple' | 'complex' }))}
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      >
       <option value="simple">{t('simpleMode') || 'Simple'}</option>
       <option value="complex">{t('complexMode') || 'Complex'}</option>
      </select>
     </Field>
     <Field label={t('templateDescription') || 'Description'} className="md:col-span-2">
      <textarea
       rows={3}
       value={draft.description}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
     <Field label={t('starterPrompt') || 'Starter Prompt'} className="md:col-span-2">
      <textarea
       rows={5}
       value={draft.starter_prompt}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, starter_prompt: e.target.value }))}
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
     <Field label={t('systemHint') || 'System Hint'} className="md:col-span-2">
      <textarea
       rows={3}
       value={draft.system_hint}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, system_hint: e.target.value }))}
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
     <Field label={t('suggestedTags') || 'Suggested Tags'}>
      <input
       value={draft.suggested_tags}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, suggested_tags: e.target.value }))}
       placeholder="research, report"
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
     <Field label={t('toolHints') || 'Tool Hints'}>
      <input
       value={draft.tool_hints}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, tool_hints: e.target.value }))}
       placeholder="search_web, read_webpage"
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
     <Field label={t('expectedArtifactTypes') || 'Expected Artifact Types'}>
      <input
       value={draft.expected_artifact_types}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, expected_artifact_types: e.target.value }))}
       placeholder="markdown, code, html"
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
     <Field label={t('artifactSchemaHint') || 'Artifact Schema Hint'} className="md:col-span-2">
      <textarea
       rows={6}
       value={draft.artifact_schema_hint}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, artifact_schema_hint: e.target.value }))}
       placeholder={t('artifactSchemaHintPlaceholder')}
       className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-focus"
      />
     </Field>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border-default px-4 py-3">
     <label className="flex items-center gap-2 text-xs text-content-secondary">
      <input
       type="checkbox"
       checked={draft.is_active}
       disabled={isReadonly}
       onChange={e => setDraft(prev => ({ ...prev, is_active: e.target.checked }))}
      />
      {t('templateActive') || 'Template active'}
     </label>

     {canEdit ? (
      <div className="flex items-center gap-2">
       {draft.id && (
        <button
         onClick={handleDeleteClick}
         className="flex items-center gap-2 border-theme-button border-border-default bg-surface-page px-3 py-2 text-xs font-bold text-content-secondary transition-colors hover:text-accent-destructive"
        >
         <Trash2 className="h-3.5 w-3.5" />
         {t('delete') || 'Delete'}
        </button>
       )}
       <button
        onClick={() => void handleSave()}
        disabled={isSaving}
        className="flex items-center gap-2 rounded-full border border-border-divider bg-accent-brand px-4 py-2 text-xs font-bold text-accent-ink transition-colors hover:border-border-hover disabled:opacity-60"
       >
        <Save className="h-3.5 w-3.5" />
        {isSaving ? t('saving') || 'Saving' : t('save') || 'Save'}
       </button>
      </div>
     ) : (
      <div className="text-tiny text-content-muted">
       {t('templateReadonlyHint') || 'Browse templates and launch flows.'}
      </div>
     )}
    </div>
   </div>

   {/* 导入对话框 */}
   <TemplateImportDialog
    open={isImportDialogOpen}
    onOpenChange={setIsImportDialogOpen}
    onSuccess={handleImportSuccess}
   />

   {/* 删除确认对话框 */}
   <DeleteConfirmDialog
    isOpen={isDeleteDialogOpen}
    onClose={() => setIsDeleteDialogOpen(false)}
    onConfirm={handleConfirmDelete}
    title={t('confirmDeleteTemplate') || 'Delete Template'}
    itemName={draft.name}
    isDeleting={isDeleting}
    variant="danger"
   />
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
   <div className="text-xs font-bold text-content-secondary">
    {label}
   </div>
   {children}
  </div>
 )
}

export default SkillTemplatePanel
