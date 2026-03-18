/**
 * 模板导入对话框
 * 
 * 支持：
 * - 上传 JSON 文件
 * - 预览模板内容
 * - 冲突检测和策略选择
 * - 导入执行
 */

import { useState, useRef, useCallback } from 'react'
import { Upload, FileJson, AlertTriangle, CheckCircle, Copy, ArrowRight, X } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  previewImportSkillTemplate,
  importSkillTemplate,
  type TemplateImportPreviewResponse,
  type ImportStrategy,
} from '@/services/admin'

interface TemplateImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type ImportStep = 'upload' | 'preview' | 'conflict' | 'result'

export function TemplateImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: TemplateImportDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [step, setStep] = useState<ImportStep>('upload')
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [preview, setPreview] = useState<TemplateImportPreviewResponse | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<ImportStrategy>('clone')
  const [customKey, setCustomKey] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: boolean
    message: string
    templateKey?: string
  } | null>(null)

  const resetState = useCallback(() => {
    setStep('upload')
    setFileName('')
    setFileContent('')
    setPreview(null)
    setSelectedStrategy('clone')
    setCustomKey('')
    setIsImporting(false)
    setImportResult(null)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onOpenChange(false)
  }, [resetState, onOpenChange])

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 验证文件类型
    if (!file.name.endsWith('.json')) {
      toast({
        title: t('invalidFileType') || 'Invalid file type',
        description: t('pleaseSelectJsonFile') || 'Please select a JSON file',
        variant: 'destructive',
      })
      return
    }

    try {
      const content = await file.text()
      setFileName(file.name)
      setFileContent(content)

      // 预览导入
      const previewData = await previewImportSkillTemplate(content)
      setPreview(previewData)

      if (previewData.valid) {
        if (previewData.conflict?.exists) {
          setStep('conflict')
          // 设置默认自定义 key
          setCustomKey(previewData.conflict.suggested_key)
        } else {
          setStep('preview')
        }
      } else {
        toast({
          title: t('invalidTemplate') || 'Invalid template',
          description: previewData.error || t('unknownError') || 'Unknown error',
          variant: 'destructive',
        })
        resetState()
      }
    } catch (error) {
      toast({
        title: t('fileReadError') || 'File read error',
        description: error instanceof Error ? error.message : t('unknownError') || 'Unknown error',
        variant: 'destructive',
      })
      resetState()
    }
  }, [toast, t, resetState])

  const handleImport = useCallback(async () => {
    if (!fileContent) return

    setIsImporting(true)
    try {
      const result = await importSkillTemplate(
        fileContent,
        selectedStrategy,
        selectedStrategy === 'clone' ? customKey : undefined
      )
      
      setImportResult({
        success: result.success,
        message: result.message,
        templateKey: result.template_key || undefined,
      })
      setStep('result')

      if (result.success) {
        onSuccess()
      }
    } catch (error) {
      toast({
        title: t('importFailed') || 'Import failed',
        description: error instanceof Error ? error.message : t('unknownError') || 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsImporting(false)
    }
  }, [fileContent, selectedStrategy, customKey, toast, t, onSuccess])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const file = e.dataTransfer.files?.[0]
    if (file && fileInputRef.current) {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      fileInputRef.current.files = dataTransfer.files
      
      // 触发 change 事件
      const event = new Event('change', { bubbles: true })
      fileInputRef.current.dispatchEvent(event)
    }
  }, [])

  const renderUploadStep = () => (
    <div
      className="border-2 border-dashed border-border-default bg-surface-page p-8 text-center"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Upload className="mx-auto h-12 w-12 text-content-muted" />
      <p className="mt-4 font-mono text-sm text-content-primary">
        {t('dragAndDropJson') || 'Drag and drop your JSON file here'}
      </p>
      <p className="mt-2 text-xs text-content-muted">
        {t('or') || 'or'}
      </p>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="mt-2 text-xs font-bold uppercase text-accent-brand hover:underline"
      >
        {t('browseFiles') || 'Browse files'}
      </button>
    </div>
  )

  const renderPreviewStep = () => {
    if (!preview?.template) return null
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-content-secondary">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>{t('templateValid') || 'Template is valid and ready to import'}</span>
        </div>

        <div className="border-2 border-border-default bg-surface-page p-4">
          <h4 className="font-mono text-xs font-bold uppercase text-content-muted">
            {t('templateInfo') || 'Template Info'}
          </h4>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-content-muted">{t('key') || 'Key'}:</span>
              <span className="font-mono text-content-primary">{preview.template.template_key}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">{t('name') || 'Name'}:</span>
              <span className="text-content-primary">{preview.template.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">{t('category') || 'Category'}:</span>
              <span className="text-content-primary">{preview.template.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">{t('mode') || 'Mode'}:</span>
              <span className="text-content-primary">{preview.template.recommended_mode}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={resetState}
            className="px-4 py-2 text-xs font-bold uppercase text-content-muted hover:text-content-primary"
          >
            {t('cancel') || 'Cancel'}
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="flex items-center gap-2 border-2 border-accent-brand bg-accent-brand px-4 py-2 font-mono text-xs font-bold uppercase text-content-inverted transition-all hover:brightness-95 disabled:opacity-50"
          >
            {isImporting ? (
              <>
                <span className="animate-spin">⟳</span>
                {t('importing') || 'Importing...'}
              </>
            ) : (
              <>
                <ArrowRight className="h-3.5 w-3.5" />
                {t('import') || 'Import'}
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  const renderConflictStep = () => {
    if (!preview?.conflict?.existing_template) return null

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded border-2 border-yellow-500/30 bg-yellow-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
          <div>
            <h4 className="font-mono text-xs font-bold uppercase text-yellow-700">
              {t('templateExists') || 'Template already exists'}
            </h4>
            <p className="mt-1 text-sm text-content-secondary">
              {t('templateKeyConflict', { key: preview.template?.template_key || '' })}
            </p>
          </div>
        </div>

        <div className="border-2 border-border-default bg-surface-page p-4">
          <h4 className="font-mono text-xs font-bold uppercase text-content-muted">
            {t('existingTemplate') || 'Existing Template'}
          </h4>
          <div className="mt-2 text-sm">
            <p className="text-content-primary">{preview.conflict.existing_template.name}</p>
            <p className="text-xs text-content-muted">
              {preview.conflict.existing_template.is_builtin 
                ? t('builtinTemplate') || 'Built-in template' 
                : t('customTemplate') || 'Custom template'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-mono text-xs font-bold uppercase text-content-muted">
            {t('importStrategy') || 'Import Strategy'}
          </label>
          
          <div className="space-y-2">
            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 border-2 p-3 transition-colors',
                selectedStrategy === 'clone'
                  ? 'border-accent-brand bg-accent-brand/5'
                  : 'border-border-default hover:border-border-strong'
              )}
            >
              <input
                type="radio"
                name="strategy"
                value="clone"
                checked={selectedStrategy === 'clone'}
                onChange={(e) => setSelectedStrategy(e.target.value as ImportStrategy)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Copy className="h-4 w-4 text-content-secondary" />
                  <span className="font-mono text-xs font-bold uppercase text-content-primary">
                    {t('clone') || 'Clone'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-content-muted">
                  {t('cloneDescription') || 'Import as a new template with a different key'}
                </p>
                {selectedStrategy === 'clone' && (
                  <input
                    type="text"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    placeholder={preview.conflict.suggested_key}
                    className="mt-2 w-full border-2 border-border-default bg-surface-page px-2 py-1 text-sm font-mono text-content-primary outline-none focus:border-border-strong"
                  />
                )}
              </div>
            </label>

            {!preview.conflict.existing_template.is_builtin && (
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 border-2 p-3 transition-colors',
                  selectedStrategy === 'override'
                    ? 'border-accent-brand bg-accent-brand/5'
                    : 'border-border-default hover:border-border-strong'
                )}
              >
                <input
                  type="radio"
                  name="strategy"
                  value="override"
                  checked={selectedStrategy === 'override'}
                  onChange={(e) => setSelectedStrategy(e.target.value as ImportStrategy)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-content-secondary" />
                    <span className="font-mono text-xs font-bold uppercase text-content-primary">
                      {t('override') || 'Override'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-content-muted">
                    {t('overrideDescription') || 'Replace the existing template with this one'}
                  </p>
                </div>
              </label>
            )}

            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 border-2 p-3 transition-colors',
                selectedStrategy === 'skip'
                  ? 'border-accent-brand bg-accent-brand/5'
                  : 'border-border-default hover:border-border-strong'
              )}
            >
              <input
                type="radio"
                name="strategy"
                value="skip"
                checked={selectedStrategy === 'skip'}
                onChange={(e) => setSelectedStrategy(e.target.value as ImportStrategy)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-content-secondary" />
                  <span className="font-mono text-xs font-bold uppercase text-content-primary">
                    {t('skip') || 'Skip'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-content-muted">
                  {t('skipDescription') || 'Do not import this template'}
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={resetState}
            className="px-4 py-2 text-xs font-bold uppercase text-content-muted hover:text-content-primary"
          >
            {t('cancel') || 'Cancel'}
          </button>
          {selectedStrategy !== 'skip' && (
            <button
              onClick={handleImport}
              disabled={isImporting || (selectedStrategy === 'clone' && !customKey)}
              className="flex items-center gap-2 border-2 border-accent-brand bg-accent-brand px-4 py-2 font-mono text-xs font-bold uppercase text-content-inverted transition-all hover:brightness-95 disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <span className="animate-spin">⟳</span>
                  {t('importing') || 'Importing...'}
                </>
              ) : (
                <>
                  <ArrowRight className="h-3.5 w-3.5" />
                  {t('import') || 'Import'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderResultStep = () => {
    if (!importResult) return null

    return (
      <div className="space-y-4 text-center">
        {importResult.success ? (
          <>
            <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            <h4 className="font-mono text-lg font-bold text-content-primary">
              {t('importSuccess') || 'Import Successful'}
            </h4>
            <p className="text-sm text-content-secondary">{importResult.message}</p>
            {importResult.templateKey && (
              <p className="font-mono text-xs text-content-muted">
                {t('templateKey') || 'Template Key'}: {importResult.templateKey}
              </p>
            )}
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto h-16 w-16 text-yellow-500" />
            <h4 className="font-mono text-lg font-bold text-content-primary">
              {t('importSkipped') || 'Import Skipped'}
            </h4>
            <p className="text-sm text-content-secondary">{importResult.message}</p>
          </>
        )}

        <button
          onClick={handleClose}
          className="mt-4 border-2 border-border-default bg-surface-page px-6 py-2 font-mono text-xs font-bold uppercase text-content-primary transition-all hover:border-border-strong"
        >
          {t('close') || 'Close'}
        </button>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm font-bold uppercase">
            <FileJson className="h-4 w-4" />
            {t('importTemplate') || 'Import Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {step === 'upload' && renderUploadStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'conflict' && renderConflictStep()}
          {step === 'result' && renderResultStep()}
        </div>
      </DialogContent>
    </Dialog>
  )
}