/**
 * ArtifactDashboard - Artifact 展示面板
 * 
 * [职责]
 * 共享组件，渲染右侧 Artifact 内容区域：
 * - Tab 切换栏
 * - Artifact 内容渲染（Code/Preview）
 * - 工具栏（编辑、复制、导出、全屏）
 * 
 * [数据获取]
 * 直连 useTaskStore 获取 selectedTask 和 artifacts
 * 
 * [v3.3.0 优化]
 * - TaskStatusIndicator 和 ArtifactLoader 提取到外部并使用 React.memo 优化
 * - 符合非 React.FC 的函数组件规范
 */

import { useState, useEffect, useRef, useCallback, Suspense, lazy, memo } from 'react'
import {
  Maximize2,
  FileCode,
  Eye,
  Code2,
  Copy,
  Check,
  Edit3,
  Save,
  X,
  Download,
  ChevronDown,
  Loader2,
  XCircle,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadMarkdown, downloadPDF, getArtifactMarkdown } from '@/utils/export'
import { logger } from '@/utils/logger'
import { useTaskActions, useTaskMode, useTasksCache, useSelectedTaskId } from '@/hooks/useTaskSelectors'
import EmptyState from '@/components/chat/EmptyState'

// 懒加载 Artifact 渲染组件
const CodeArtifact = lazy(() =>
  import('@/components/artifacts/CodeArtifact').then((m) => ({ default: m.default }))
)
const DocArtifact = lazy(() =>
  import('@/components/artifacts/DocArtifact').then((m) => ({ default: m.default }))
)
const HtmlArtifact = lazy(() =>
  import('@/components/artifacts/HtmlArtifact').then((m) => ({ default: m.default }))
)
const MediaArtifact = lazy(() =>
  import('@/components/artifacts/MediaArtifact').then((m) => ({ default: m.default }))
)

interface ArtifactDashboardProps {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '保存失败'
}

// ============================================================================
// 提取的子组件（使用 React.memo 优化性能）
// ============================================================================

/**
 * 状态指示器组件
 * 显示当前任务执行状态
 */
const TaskStatusIndicator = memo(function TaskStatusIndicator() {
  const mode = useTaskMode()
  const tasks = useTasksCache()
  const runningTask = tasks.find((t) => t.status === 'running')

  if (mode === 'simple') {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-status-online" />
        </span>
        <span>Ready</span>
      </div>
    )
  }

  if (!runningTask) {
    const allCompleted = tasks.every(
      (t) => t.status === 'completed' || t.status === 'failed'
    )
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        {allCompleted ? (
          <>
            <CheckCircle2 className="w-3 h-3 text-status-online" />
            <span>Completed</span>
          </>
        ) : (
          <span>Waiting...</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-info opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-status-info" />
      </span>
      <span className="text-content-primary truncate max-w-[80px] sm:max-w-[150px]">
        {runningTask.expert_type}
      </span>
      <span className="text-muted-foreground hidden sm:inline">running</span>
    </div>
  )
})

/**
 * Loading 组件
 * 用于 Suspense fallback
 */
const ArtifactLoader = memo(function ArtifactLoader() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <div className="w-2 h-2 bg-accent animate-pulse" />
        <span>Loading...</span>
      </div>
    </div>
  )
})

// ============================================================================
// 主组件
// ============================================================================

export default function ArtifactDashboard({
  isFullscreen,
  onToggleFullscreen,
}: ArtifactDashboardProps) {
  // 从 Store 获取选中的任务
  const selectedTaskId = useSelectedTaskId()
  const tasks = useTasksCache()
  const selectedTask = tasks.find((t) => t.id === selectedTaskId)
  const artifacts = selectedTask?.artifacts || []
  const expertName = selectedTask?.expert_type || 'Expert'

  // 本地状态
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code')
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isExportingPDF, setIsExportingPDF] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [editContent, setEditContent] = useState('')
  
  const tabsRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  
  const { updateArtifactContent } = useTaskActions()
  const currentArtifact = artifacts[selectedIndex] || null
  const currentArtifactId = currentArtifact?.id
  const currentArtifactContent = currentArtifact?.content
  const currentArtifactType = currentArtifact?.type

  // 重置选中索引当任务变化时
  useEffect(() => {
    setSelectedIndex(0)
  }, [selectedTaskId])

  // 🔥 额外监听 artifacts 数组变化（切换会话时 selectedTaskId 可能不变）
  useEffect(() => {
    // 如果当前选中的索引超出范围，重置为 0
    if (selectedIndex >= artifacts.length) {
      setSelectedIndex(0)
    }
  }, [artifacts.length, selectedIndex])

  // 重置编辑状态当 artifact 变化时
  useEffect(() => {
    setIsEditing(false)
    setSaveError(null)
    if (currentArtifactContent !== undefined && currentArtifactType !== undefined) {
      setEditContent(currentArtifactContent)
      setViewMode(currentArtifactType === 'html' ? 'preview' : 'code')
    }
  }, [currentArtifactId, currentArtifactContent, currentArtifactType])

  // 同步流式内容
  useEffect(() => {
    if (!isEditing && currentArtifactContent !== undefined) {
      setEditContent(currentArtifactContent)
    }
  }, [currentArtifactContent, isEditing])

  // 点击外部关闭导出菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExportMenu])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  // 导出 Markdown
  const handleExportMarkdown = useCallback(() => {
    if (!currentArtifact) return
    const markdown = getArtifactMarkdown(currentArtifact)
    downloadMarkdown(currentArtifact.title || currentArtifact.type, markdown)
    setShowExportMenu(false)
  }, [currentArtifact])

  // 导出 PDF
  const handleExportPDF = useCallback(async () => {
    if (!currentArtifact) return
    setIsExportingPDF(true)
    setShowExportMenu(false)
    try {
      await downloadPDF(`artifact-content-${currentArtifact.id}`, currentArtifact.title || currentArtifact.type)
    } catch (err) {
      logger.error('PDF export failed:', err)
    } finally {
      setIsExportingPDF(false)
    }
  }, [currentArtifact])

  // 复制内容
  const handleCopy = useCallback(async () => {
    const text = currentArtifact?.content || ''
    if (!text) return

    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (_err) {
      // Silent fail
    }
  }, [currentArtifact])

  // 编辑模式
  const handleEdit = useCallback(() => {
    setEditContent(currentArtifact?.content || '')
    setSaveError(null)
    setIsEditing(true)
  }, [currentArtifact])

  // 保存编辑
  const handleSave = useCallback(async () => {
    if (!selectedTaskId || !currentArtifact) return
    
    setIsSaving(true)
    setSaveError(null)
    try {
      await updateArtifactContent(selectedTaskId, currentArtifact.id, editContent)
      setIsEditing(false)
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }, [selectedTaskId, currentArtifact, editContent, updateArtifactContent])

  // 取消编辑
  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setSaveError(null)
    setEditContent(currentArtifact?.content || '')
  }, [currentArtifact])

  // 检查功能可用性
  const canPreview = !isEditing && currentArtifact?.type !== 'text'
  const canEdit = !currentArtifact?.isPreview && 
    (currentArtifact?.type === 'code' || currentArtifact?.type === 'markdown' || currentArtifact?.type === 'text')
  const contentElementId = currentArtifact ? `artifact-content-${currentArtifact.id}` : ''

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-page overflow-hidden">
      {/* Tab bar */}
      <div className="h-10 flex items-center border-b-2 border-border-default bg-panel shrink-0 px-2">
        <div className="flex-1 flex items-center gap-1 min-w-0 overflow-hidden">
          {artifacts.length > 0 && (
            <>
              <div className="h-7 px-2 flex items-center gap-1.5 bg-accent text-accent-foreground border-2 border-border-default shrink-0">
                <span className="font-mono text-[10px] font-bold uppercase">{expertName}</span>
                <span className="text-[9px] opacity-70">({artifacts.length})</span>
              </div>
              <div className="w-px h-5 bg-border mx-1 shrink-0" />
            </>
          )}

          <div ref={tabsRef} className="flex-1 flex items-end gap-1 overflow-x-auto scrollbar-hide min-w-0">
            {artifacts.length === 0 ? (
              <div className="h-7 px-4 flex items-center text-muted-foreground/60 text-xs font-mono">
                Waiting...
              </div>
            ) : (
              artifacts.map((artifact, idx) => (
                <button
                  key={`${artifact.id}-${idx}`}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={cn(
                    'h-7 px-2 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer',
                    selectedIndex === idx
                      ? 'h-8 bg-surface-card border-2 border-border-default border-b-0 top-[2px] z-10 text-content-primary shadow-[0_-2px_0_0_rgb(var(--accent-brand))]'
                      : 'bg-panel border-2 border-border-default/30 border-b-0 opacity-60 hover:opacity-100 text-muted-foreground'
                  )}
                >
                  <FileCode className="w-3 h-3 shrink-0 pointer-events-none" />
                  <span className="font-mono text-xs font-bold truncate max-w-[80px] pointer-events-none">
                    {artifact.title || `${expertName}-${idx + 1}`}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 状态指示器 */}
        <div className="flex-none flex items-center pl-3 ml-2 border-l border-border-default/50 shrink-0">
          <TaskStatusIndicator />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 bg-surface-card p-2 overflow-hidden relative min-h-0 min-w-0">
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
        <div className="absolute inset-2 border border-border-default bg-surface-card shadow-sm flex flex-col overflow-hidden min-w-0">
          {!currentArtifact ? (
            <EmptyState variant="detailed" />
          ) : (
            <div className="h-full flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-border-default bg-panel shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-[10px] font-mono text-content-primary uppercase">
                    <FileCode className="w-3 h-3 text-accent" />
                    <span className="font-bold">
                      {isEditing ? 'Editing' : currentArtifact.language || currentArtifact.type}
                    </span>
                  </div>
                </div>

                {/* Right toolbar */}
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                          'w-7 h-7 flex items-center justify-center border-2 transition-all',
                          isSaving
                            ? 'bg-status-online text-white border-status-online cursor-not-allowed'
                            : 'bg-status-online text-white border-status-online hover:bg-status-online/90'
                        )}
                        title={isSaving ? 'Saving...' : 'Save'}
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={isSaving}
                        className={cn(
                          'w-7 h-7 flex items-center justify-center border-2 transition-all',
                          isSaving
                            ? 'bg-panel text-muted-foreground border-border-default cursor-not-allowed'
                            : 'bg-panel text-content-primary border-border-default hover:border-status-offline hover:text-status-offline'
                        )}
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px h-4 bg-border/50 mx-1" />
                    </>
                  ) : (
                    <>
                      {canEdit && (
                        <>
                          <button
                            onClick={handleEdit}
                            className={cn(
                              'w-7 h-7 flex items-center justify-center border-2 transition-all',
                              'bg-panel text-content-primary border-border-default hover:border-primary hover:bg-surface-card'
                            )}
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <div className="w-px h-4 bg-border/50 mx-1" />
                        </>
                      )}
                      {canPreview && (
                        <>
                          <button
                            onClick={() => setViewMode('code')}
                            className={cn(
                              'w-7 h-7 flex items-center justify-center border-2 transition-all',
                              viewMode === 'code'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-panel text-content-primary border-border-default hover:border-primary hover:bg-surface-card'
                            )}
                            title="Code"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setViewMode('preview')}
                            className={cn(
                              'w-7 h-7 flex items-center justify-center border-2 transition-all',
                              viewMode === 'preview'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-panel text-content-primary border-border-default hover:border-primary hover:bg-surface-card'
                            )}
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <div className="w-px h-4 bg-border/50 mx-1" />
                        </>
                      )}
                      {/* Export dropdown */}
                      <div ref={exportMenuRef} className="relative">
                        <button
                          onClick={() => setShowExportMenu(!showExportMenu)}
                          disabled={isExportingPDF}
                          className={cn(
                            'h-7 px-1.5 flex items-center gap-0.5 border-2 transition-all',
                            isExportingPDF
                              ? 'bg-primary/50 text-primary-foreground border-primary/50 cursor-wait'
                              : 'bg-panel text-content-primary border-border-default hover:border-primary hover:bg-surface-card'
                          )}
                          title="Export"
                        >
                          {isExportingPDF ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <ChevronDown className={cn('w-3 h-3 transition-transform', showExportMenu && 'rotate-180')} />
                            </>
                          )}
                        </button>

                        {showExportMenu && (
                          <div className="absolute right-0 top-full mt-1 z-50 w-[150px] bg-surface-card border-2 border-border-default shadow-lg">
                            <button
                              onClick={handleExportMarkdown}
                              className="w-full px-3 py-2 text-left text-xs text-content-primary hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between"
                            >
                              <span>Markdown</span>
                              <span className="text-[10px] text-muted-foreground font-mono">.md</span>
                            </button>
                            <div className="border-t border-border-default" />
                            <button
                              onClick={handleExportPDF}
                              className="w-full px-3 py-2 text-left text-xs text-content-primary hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between"
                            >
                              <span>PDF</span>
                              <span className="text-[10px] text-muted-foreground font-mono">.pdf</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="w-px h-4 bg-border/50 mx-1" />

                      <button
                        onClick={handleCopy}
                        className={cn(
                          'w-7 h-7 flex items-center justify-center border-2 transition-all',
                          copied
                            ? 'bg-status-online text-white border-status-online'
                            : 'bg-panel text-content-primary border-border-default hover:border-primary hover:bg-surface-card'
                        )}
                        title={copied ? 'Copied' : 'Copy'}
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <div className="w-px h-4 bg-border/50 mx-1" />
                    </>
                  )}

                  <button
                    onClick={onToggleFullscreen}
                    className={cn(
                      'w-7 h-7 flex items-center justify-center border-2 transition-all',
                      isFullscreen
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-panel text-content-primary border-border-default hover:border-primary hover:bg-surface-card'
                    )}
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden min-h-0 min-w-0 relative">
                {isEditing ? (
                  <div className="h-full w-full flex flex-col">
                    {saveError && (
                      <div className="px-4 py-2 bg-status-offline/10 border-b border-status-offline/20">
                        <div className="flex items-center gap-2 text-xs text-status-offline">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{saveError}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex-1 bg-surface-elevated">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        disabled={isSaving}
                        className="w-full h-full p-4 font-mono text-sm bg-transparent border-0 resize-none focus:outline-none focus:ring-0 text-content-primary disabled:opacity-50"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                ) : viewMode === 'code' ? (
                  <Suspense fallback={<ArtifactLoader />}>
                    <div id={contentElementId} className="h-full w-full overflow-auto bauhaus-scrollbar p-0 bg-surface-card">
                      <CodeArtifact
                        content={currentArtifact.content}
                        language={currentArtifact.language || currentArtifact.type}
                        className="h-full"
                      />
                    </div>
                  </Suspense>
                ) : (
                  <Suspense fallback={<ArtifactLoader />}>
                    <div id={contentElementId} className="h-full w-full overflow-auto bauhaus-scrollbar p-4 bg-surface-card">
                      {currentArtifact.type === 'html' ? (
                        <HtmlArtifact content={currentArtifact.content} className="h-full" />
                      ) : currentArtifact.type === 'image' || currentArtifact.type === 'video' || currentArtifact.type === 'media' ? (
                        <MediaArtifact
                          content={currentArtifact.content}
                          type={currentArtifact.type as 'image' | 'video' | 'media'}
                          title={currentArtifact.title}
                          className="h-full"
                        />
                      ) : currentArtifact.type === 'markdown' ||
                        currentArtifact.content.includes('#') ||
                        currentArtifact.content.includes('**') ? (
                        <DocArtifact
                          content={currentArtifact.content}
                          className="h-full"
                          isStreaming={currentArtifact.isStreaming}
                        />
                      ) : (
                        <CodeArtifact
                          content={currentArtifact.content}
                          language={currentArtifact.language || currentArtifact.type}
                          className="h-full"
                        />
                      )}
                    </div>
                  </Suspense>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
