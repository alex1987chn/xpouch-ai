/**
 * ArtifactViewerModal - 产物大弹框查看器
 *
 * [设计] 侧栏卡片只负责"发现"，完整阅读/操作进大框（蓝本 modal 形态放大）。
 * 头部动作组：视图/代码切换 · 编辑 · 复制 · 下载 · 导出 MD · 导出 PDF · 分享 · 关闭。
 * 导出 PDF 走打印流：打印根节点单独挂 body 并强制 soft 主题（暗色下导出也是白底）。
 * 外壳复用 ModalShell；类型色/图标/能力位取自 lib/artifactPresentation。
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '@/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, Pencil, Copy, Check, Download, Share2, FileText, Eye, Code2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { getArtifactDetail, shareArtifact, updateArtifactContent } from '@/services/artifacts'
import { artifactsKeys } from '@/hooks/queries/useArtifactsQuery'
import ArtifactRenderer from '@/components/artifacts/ArtifactRenderer'
import { ModalShell } from '@/components/ui/modal-shell'
import { Skeleton } from '@/components/ui/skeleton'
import { pushToast } from '@/components/ui/use-toast'
import {
  EDITABLE_ARTIFACT_TYPES, MD_EXPORTABLE_TYPES,
  artifactTypeChipStyle, artifactFileExt,
} from '@/lib/artifactPresentation'
import { toLocalDate, localeForLanguage } from '@/lib/datetime'
import { cn } from '@/lib/utils'

interface ArtifactViewerModalProps {
  artifactId: string | null
  onClose: () => void
  /** 当前线程（编辑保存后精准失效本线程产物列表） */
  threadId?: string | null
}

export function ArtifactViewerModal({ artifactId, onClose, threadId }: ArtifactViewerModalProps) {
  const { t, language } = useTranslation()
  const [mode, setMode] = useState<'view' | 'code'>('view')
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [printKey, setPrintKey] = useState(0)
  const queryClient = useQueryClient()

  const detailQuery = useQuery({
    queryKey: ['artifactDetail', artifactId],
    queryFn: () => getArtifactDetail(artifactId!),
    enabled: !!artifactId,
    staleTime: 60_000,
  })
  const detail = detailQuery.data

  // 切换产物时复位视图状态
  useEffect(() => {
    setMode('view')
    setEditing(false)
  }, [artifactId])

  const open = !!artifactId

  const handleCopy = async () => {
    if (!detail?.content) return
    try {
      await navigator.clipboard.writeText(detail.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      pushToast({ title: t('copyFailed') || 'Copy failed', variant: 'destructive' })
    }
  }

  const handleShare = useCallback(async () => {
    if (!detail) return
    try {
      const { path } = await shareArtifact(detail.id)
      await navigator.clipboard.writeText(window.location.origin + path)
      pushToast({ title: t('artifactShareCopied') })
    } catch {
      pushToast({ title: t('saveFailed'), variant: 'destructive' })
    }
  }, [detail, t])

  const handleStartEdit = () => {
    if (!detail?.content) return
    setEditDraft(detail.content)
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!detail) return
    setIsSaving(true)
    try {
      await updateArtifactContent(detail.id, editDraft)
      pushToast({ title: t('saved') || 'Saved' })
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['artifactDetail', detail.id] })
      queryClient.invalidateQueries({ queryKey: artifactsKeys.threadList(threadId || detail.thread_id || '') })
      queryClient.invalidateQueries({ queryKey: artifactsKeys.all })
    } catch (error) {
      pushToast({ title: (error as Error).message || t('saveFailed'), variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const downloadBlob = (content: string, ext: string) => {
    const base = (detail?.title || detail?.type || 'artifact').replace(/[\\/:*?"<>|]/g, '_')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${base}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownload = () => {
    if (!detail?.content) return
    downloadBlob(detail.content, artifactFileExt(detail.type))
  }

  const handleExportMd = () => {
    if (!detail?.content) return
    downloadBlob(detail.content, 'md')
  }

  /** 导出 PDF：打印流（打印对话框里选"另存为 PDF"） */
  const handleExportPdf = () => {
    setPrintKey(k => k + 1)
    // 等打印根节点完成一帧渲染（懒加载渲染器可能晚一拍，双 rAF 兜底）
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print()
    }))
  }

  const locale = localeForLanguage(language)
  const createdLabel = detail?.created_at
    ? formatDistanceToNow(toLocalDate(detail.created_at), { addSuffix: true, locale })
    : ''
  const isMdAble = !!detail && MD_EXPORTABLE_TYPES.has(detail.type)
  const canEdit = !!detail && EDITABLE_ARTIFACT_TYPES.has(detail.type)

  const actionBtn = 'flex h-8 items-center gap-1.5 rounded-full border border-border-divider bg-surface-card px-3 text-xs font-medium text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary'

  return (
    <>
      <ModalShell
        open={open}
        onClose={onClose}
        labelledBy="artifact-viewer-title"
        panelClassName="flex h-[84vh] w-[min(920px,94vw)] flex-col overflow-hidden"
      >
        {/* 头部：类型 + 标题 + 动作组 */}
        <div className="flex items-center gap-2.5 border-b border-border-divider px-4 py-3">
          {detail && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-nano font-medium"
              style={artifactTypeChipStyle(detail.type)}
            >
              {detail.type}
            </span>
          )}
          <div id="artifact-viewer-title" className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold text-content-primary">
              {detail?.title || detail?.content_preview?.slice(0, 24) || detail?.type || '…'}
            </div>
            {detail?.created_at && (
              <div className="text-nano text-content-muted">{createdLabel}</div>
            )}
          </div>
          {!editing && detail && (
            <div className="flex items-center gap-1.5">
              {canEdit && (
                <button
                  onClick={handleStartEdit}
                  title={t('edit')}
                  className={actionBtn}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('edit')}</span>
                </button>
              )}
              <div className="flex h-8 items-center overflow-hidden rounded-full border border-border-divider" role="group">
                <button
                  onClick={() => setMode('view')}
                  className={cn(
                    'flex h-full items-center gap-1 px-2.5 text-xs transition-colors',
                    mode === 'view' ? 'bg-surface-tint font-bold text-content-primary' : 'text-content-secondary hover:text-content-primary'
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />{t('artView')}
                </button>
                <button
                  onClick={() => setMode('code')}
                  className={cn(
                    'flex h-full items-center gap-1 px-2.5 text-xs transition-colors',
                    mode === 'code' ? 'bg-surface-tint font-bold text-content-primary' : 'text-content-secondary hover:text-content-primary'
                  )}
                >
                  <Code2 className="h-3.5 w-3.5" />{t('artCode')}
                </button>
              </div>
              <button onClick={handleCopy} title={t('copy')} className={cn(actionBtn, 'w-8 justify-center px-0')}>
                {copied ? <Check className="h-3.5 w-3.5 text-accent-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button onClick={handleDownload} title={t('download')} className={cn(actionBtn, 'w-8 justify-center px-0')}>
                <Download className="h-3.5 w-3.5" />
              </button>
              {isMdAble && (
                <button onClick={handleExportMd} className={actionBtn}>
                  <FileText className="h-3.5 w-3.5" />{t('artExportMd')}
                </button>
              )}
              <button onClick={handleExportPdf} className={actionBtn}>
                {t('artExportPdf')}
              </button>
              <button onClick={handleShare} className={cn(actionBtn, 'w-8 justify-center px-0')} title={t('artifactShareAction')}>
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={onClose}
            title={t('close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-divider text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 正文 */}
        <div className="min-h-0 flex-1 overflow-hidden bg-surface-page">
          {detailQuery.isLoading || !detail ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : editing ? (
            <div className="flex h-full flex-col gap-2 p-3">
              <textarea
                value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
                className="min-h-0 flex-1 resize-none rounded-lg border-theme-input border-border-default bg-surface-card p-3 font-mono text-xs leading-relaxed text-content-primary focus:border-border-focus focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditing(false)}
                  disabled={isSaving}
                  className="rounded-full border border-border-divider bg-surface-card px-4 py-1.5 text-xs font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
                  disabled={isSaving}
                  className="rounded-full border border-border-divider bg-accent-brand px-5 py-1.5 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                >
                  {isSaving ? (t('saving') || 'Saving') : (t('save') || 'Save')}
                </button>
              </div>
            </div>
          ) : mode === 'code' ? (
            <pre className="h-full overflow-auto p-4 font-mono text-xs leading-relaxed text-content-primary">
              {detail.content}
            </pre>
          ) : (
            <div className="h-full overflow-auto p-4">
              <ArtifactRenderer
                type={detail.type}
                language={detail.language}
                title={detail.title}
                content={detail.content || ''}
              />
            </div>
          )}
        </div>
      </ModalShell>

      {/* 打印根节点：挂在 body 上，打印时只显示它（强制 soft 主题） */}
      {detail?.content && createPortal(
        <div id="artifact-print-root" key={printKey} data-theme="soft" className="print-root">
          <h1 className="print-title">{detail.title || detail.type}</h1>
          <ArtifactRenderer
            type={detail.type}
            language={detail.language}
            title={detail.title}
            content={detail.content}
          />
        </div>,
        document.body
      )}
    </>
  )
}

export default ArtifactViewerModal
