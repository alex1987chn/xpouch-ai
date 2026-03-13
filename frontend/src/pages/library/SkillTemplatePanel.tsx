import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bot, FileCode, Plus, Rocket, Save, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import {
  createSkillTemplate,
  deleteSkillTemplate,
  getSkillTemplates,
  type SkillTemplate,
  updateSkillTemplate,
} from '@/services/admin'

// Artifact 类型标签颜色映射
const ARTIFACT_TYPE_COLORS: Record<string, string> = {
  markdown: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  code: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  html: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  text: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  image: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
}

interface SkillTemplatePanelProps {
  searchQuery: string
  /** 是否可编辑模板（新建/编辑/删除），仅 admin / edit_admin */
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
      const data = await getSkillTemplates(isAdmin)
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
    navigate(`/chat/${crypto.randomUUID()}`, {
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

  const handleDelete = async () => {
    if (!draft.id) return
    if (draft.is_builtin) {
      toast({
        title: t('deleteFailed') || 'Delete failed',
        description: t('builtinTemplateCannotDelete') || 'Builtin templates cannot be deleted.',
        variant: 'destructive',
      })
      return
    }
    try {
      await deleteSkillTemplate(draft.id)
      toast({
        title: t('deleted') || 'Deleted',
        description: t('templateDeleted') || 'Template deleted successfully.',
      })
      await refreshTemplates()
    } catch (error) {
      toast({
        title: t('deleteFailed') || 'Delete failed',
        description: error instanceof Error ? error.message : t('deleteFailed'),
        variant: 'destructive',
      })
    }
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
        <div className="flex items-center justify-between border-b-2 border-border-default px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-content-secondary" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
              {t('skillTemplates') || 'Skill Templates'}
            </span>
          </div>
          {canEdit && (
            <button
              onClick={handleCreate}
              className="flex items-center gap-1 border-2 border-border-default bg-surface-page px-2 py-1 text-[10px] font-bold uppercase text-content-secondary transition-colors hover:border-border-strong hover:text-content-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('newTemplate') || 'New'}
            </button>
          )}
        </div>

        {filteredTemplates.length > 0 ? (
          <div className="max-h-[70vh] overflow-y-auto bauhaus-scrollbar">
            {filteredTemplates.map(template => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className={cn(
                  'w-full border-b-2 border-border-default px-4 py-3 text-left transition-colors',
                  selectedId === template.id
                    ? 'bg-surface-elevated'
                    : 'bg-surface-card hover:bg-surface-page'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs font-bold uppercase text-content-primary">
                    {template.name}
                  </span>
                  <span className="shrink-0 text-[9px] uppercase text-content-muted">
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
                          'inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase',
                          ARTIFACT_TYPE_COLORS[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
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
            <p className="font-mono text-xs uppercase text-content-muted">
              {t('noTemplatesFound') || 'No templates found'}
            </p>
          </div>
        )}
      </div>

      <div className="border-2 border-border-default bg-surface-card shadow-theme-card">
        <div className="flex items-center justify-between border-b-2 border-border-default px-4 py-3">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
              {draft.id ? t('templateDetail') || 'Template Detail' : t('createTemplate') || 'Create Template'}
            </div>
            <div className="mt-1 text-xs text-content-muted">
              {draft.id ? selectedTemplate?.template_key : t('templateEditorHint') || 'Build a reusable starter flow.'}
            </div>
          </div>
          {selectedTemplate && (
            <button
              onClick={() => handleUseTemplate(selectedTemplate)}
              className="flex items-center gap-2 border-2 border-accent-brand bg-accent-brand px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-content-inverted transition-all hover:brightness-95"
            >
              <Rocket className="h-3.5 w-3.5" />
              {t('useTemplate') || 'Use'}
            </button>
          )}
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label={t('templateKey') || 'Template Key'}>
            <input
              value={draft.template_key}
              disabled={Boolean(draft.id) || isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, template_key: e.target.value }))}
              className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong disabled:opacity-60"
            />
          </Field>
          <Field label={t('moduleName') || 'Name'}>
            <input
              value={draft.name}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
              className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
            />
          </Field>
          <Field label={t('category') || 'Category'}>
            <input
              value={draft.category}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, category: e.target.value }))}
              className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
            />
          </Field>
          <Field label={t('recommendedMode') || 'Recommended Mode'}>
            <select
              value={draft.recommended_mode}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, recommended_mode: e.target.value as 'simple' | 'complex' }))}
              className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
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
              className="w-full resize-y border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
            />
          </Field>
          <Field label={t('starterPrompt') || 'Starter Prompt'} className="md:col-span-2">
            <textarea
              rows={5}
              value={draft.starter_prompt}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, starter_prompt: e.target.value }))}
              className="w-full resize-y border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
            />
          </Field>
          <Field label={t('systemHint') || 'System Hint'} className="md:col-span-2">
            <textarea
              rows={3}
              value={draft.system_hint}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, system_hint: e.target.value }))}
              className="w-full resize-y border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
            />
          </Field>
          <Field label={t('suggestedTags') || 'Suggested Tags'}>
            <input
              value={draft.suggested_tags}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, suggested_tags: e.target.value }))}
              placeholder="research, report"
              className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
            />
          </Field>
          <Field label={t('toolHints') || 'Tool Hints'}>
            <input
              value={draft.tool_hints}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, tool_hints: e.target.value }))}
              placeholder="search_web, read_webpage"
              className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
            />
          </Field>
          <Field label={t('expectedArtifactTypes') || 'Expected Artifact Types'}>
            <input
              value={draft.expected_artifact_types}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, expected_artifact_types: e.target.value }))}
              placeholder="markdown, code, html"
              className="w-full border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary outline-none focus:border-border-strong"
            />
          </Field>
          <Field label={t('artifactSchemaHint') || 'Artifact Schema Hint'} className="md:col-span-2">
            <textarea
              rows={6}
              value={draft.artifact_schema_hint}
              disabled={isReadonly}
              onChange={e => setDraft(prev => ({ ...prev, artifact_schema_hint: e.target.value }))}
              placeholder="产出物应包含：&#10;# 标题&#10;- 要点1&#10;- 要点2"
              className="w-full resize-y border-2 border-border-default bg-surface-page px-3 py-2 text-sm text-content-primary font-mono outline-none focus:border-border-strong"
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
                  onClick={() => void handleDelete()}
                  className="flex items-center gap-2 border-2 border-border-default bg-surface-page px-3 py-2 font-mono text-[10px] font-bold uppercase text-content-secondary transition-colors hover:text-accent-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('delete') || 'Delete'}
                </button>
              )}
              <button
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="flex items-center gap-2 border-2 border-border-default bg-surface-elevated px-3 py-2 font-mono text-[10px] font-bold uppercase text-content-primary transition-colors hover:border-border-strong disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? t('saving') || 'Saving' : t('save') || 'Save'}
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-content-muted">
              {t('templateReadonlyHint') || 'Browse templates and launch flows.'}
            </div>
          )}
        </div>
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

export default SkillTemplatePanel
