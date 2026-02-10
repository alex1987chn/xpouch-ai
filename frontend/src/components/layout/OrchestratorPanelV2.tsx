/**
 * OrchestratorPanelV2 - Performance Optimized (v3.6)
 * 
 * [优化说明]
 * - 使用 Zustand Selectors 避免不必要的重渲染
 * - 当 AI 生成回复时，面板保持静止（不触发 Render）
 */

import { useState, lazy, Suspense, memo, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Maximize2, FileCode,
  Eye, Code2, Copy, Check, Loader2, CheckCircle2, Clock, XCircle
} from 'lucide-react'
import type { Task } from '@/store/taskStore'
import type { Artifact } from '@/types'
import { SIMPLE_TASK_ID } from '@/constants/task'
import EmptyState from '@/components/chat/EmptyState'

// Performance Optimized Selectors (v3.6)
import {
  useTaskMode,
  useTasksCache,
  useSelectedTaskId,
  useSelectTaskAction,
} from '@/hooks/useTaskSelectors'

const CodeArtifact = lazy(() => import('@/components/artifacts/CodeArtifact').then(m => ({ default: m.default })))
const DocArtifact = lazy(() => import('@/components/artifacts/DocArtifact').then(m => ({ default: m.default })))
const HtmlArtifact = lazy(() => import('@/components/artifacts/HtmlArtifact').then(m => ({ default: m.default })))
const BusRail = lazy(() => import('@/components/layout/ExpertRail/BusRail').then(m => ({ default: m.default })))

interface OrchestratorPanelV2Props {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

const expertLabels: Record<string, string> = {
  search: 'SRCH', coder: 'CODE', researcher: 'RSCH', analyzer: 'DATA',
  writer: 'WRT', planner: 'PLAN', designer: 'DSGN', architect: 'ARC', default: 'AGENT',
}

const StatusIcon = memo(({ status }: { status: string }) => {
  switch (status) {
    case 'running': return <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
    case 'completed': return <CheckCircle2 className="w-3 h-3 text-green-500" />
    case 'failed': return <XCircle className="w-3 h-3 text-red-500" />
    default: return <Clock className="w-3 h-3 text-muted-foreground" />
  }
})

export default function OrchestratorPanelV2({ isFullscreen, onToggleFullscreen }: OrchestratorPanelV2Props) {
  const mode = useTaskMode()
  return mode === 'complex'
    ? <ComplexModePanel {...{ isFullscreen, onToggleFullscreen }} />
    : <SimpleModePanel {...{ isFullscreen, onToggleFullscreen }} />
}

// Simple Mode - uses taskStore to carry preview content
function SimpleModePanel({ isFullscreen, onToggleFullscreen }: OrchestratorPanelV2Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const tasks = useTasksCache()
  const selectedTask = tasks.find(t => t.id === SIMPLE_TASK_ID)
  const artifacts = selectedTask?.artifacts || []
  const currentArtifact = artifacts[selectedIndex] || null

  // Reset selected index when task changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [selectedTask?.id])

  return (
    <div className="flex-1 flex h-full bg-page">
      <ExpertRailSimple hasArtifact={!!currentArtifact} />
      <ArtifactDashboard 
        expertName="AI" 
        artifacts={artifacts} 
        selectedArtifact={currentArtifact} 
        selectedIndex={selectedIndex} 
        onSelectArtifact={setSelectedIndex} 
        {...{ isFullscreen, onToggleFullscreen }} 
      />
    </div>
  )
}

// Complex Mode
function ComplexModePanel({ isFullscreen, onToggleFullscreen }: OrchestratorPanelV2Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  // Performance Optimized Selectors
  const selectedTaskId = useSelectedTaskId()
  const selectTask = useSelectTaskAction()
  const tasks = useTasksCache()
  
  // Compute selected task from cache
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null

  // Auto-select first task if none selected
  useEffect(() => { 
    if (tasks.length && !selectedTaskId) selectTask(tasks[0].id) 
  }, [tasks, selectedTaskId, selectTask])
  
  // Reset index when task changes
  useEffect(() => setSelectedIndex(0), [selectedTaskId])

  const currentArtifact = selectedTask?.artifacts[selectedIndex] || null

  return (
    <div className="flex-1 flex h-full bg-page">
      <Suspense fallback={<div className="w-20 border-r-2 border-border bg-page flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>}>
        <BusRail tasks={tasks} selectedTaskId={selectedTaskId} onTaskClick={selectTask} />
      </Suspense>
      <ArtifactDashboard
        expertName={selectedTask?.expert_type || 'Expert'}
        artifacts={selectedTask?.artifacts || []}
        selectedArtifact={currentArtifact}
        selectedIndex={selectedIndex}
        onSelectArtifact={setSelectedIndex}
        {...{ isFullscreen, onToggleFullscreen }}
      />
    </div>
  )
}

// Expert Rail - Simple
function ExpertRailSimple({ hasArtifact }: { hasArtifact: boolean }) {
  return (
    <div className="w-14 border-r-2 border-border bg-page flex flex-col items-center py-2 shrink-0">
      <div className="w-[1px] h-4 bg-border/50 mb-2" />
      <div className="relative group">
        <div className="w-10 h-10 border-2 border-border bg-card shadow-[2px_2px_0_0_rgba(0,0,0,0.2)] flex items-center justify-center">
          <span className="font-black text-xs text-primary">AI</span>
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-card rounded-full flex items-center justify-center">
          <StatusIcon status={hasArtifact ? 'completed' : 'running'} />
        </div>
      </div>
      <div className="flex-1 w-[1px] bg-border/30 border-l border-dashed border-border/30 min-h-[20px] mt-4" />
    </div>
  )
}

// Artifact Dashboard
interface ArtifactDashboardProps {
  expertName: string
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  selectedIndex: number
  onSelectArtifact: (index: number) => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

// Task Status Indicator - shown on the right side of Level 1
function TaskStatusIndicator() {
  const mode = useTaskMode()
  const tasks = useTasksCache()
  
  // Compute running task from cache
  const runningTask = tasks.find((t) => t.status === 'running')

  if (mode === 'simple') {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
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
            <CheckCircle2 className="w-3 h-3 text-green-500" />
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
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
      
      <span className="text-primary truncate max-w-[80px] sm:max-w-[150px]">
        {runningTask.expert_type}
      </span>
      
      <span className="text-muted-foreground hidden sm:inline">running</span>
    </div>
  )
}

function ArtifactDashboard({ expertName, artifacts, selectedArtifact, selectedIndex, 
  onSelectArtifact, isFullscreen, onToggleFullscreen }: ArtifactDashboardProps) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    const container = tabsRef.current
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0)
      setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 5)
    }
  }

  useEffect(() => {
    checkScroll()
    const container = tabsRef.current
    if (container) {
      container.addEventListener('scroll', checkScroll)
      return () => container.removeEventListener('scroll', checkScroll)
    }
  }, [artifacts])

  const scrollLeft = () => tabsRef.current?.scrollBy({ left: -100, behavior: 'smooth' })
  const scrollRight = () => tabsRef.current?.scrollBy({ left: 100, behavior: 'smooth' })

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-page overflow-hidden">
      {/* Tab bar - left/right split: left Tabs, right status */}
      <div className="h-10 flex items-center border-b-2 border-border bg-panel shrink-0 px-2">
        {/* Left: Tabs area (adaptive + scrollable) */}
        <div className="flex-1 flex items-center gap-1 min-w-0 overflow-hidden">
          {canScrollLeft && (
            <button onClick={scrollLeft} className="h-7 w-6 flex items-center justify-center bg-panel border-2 border-border hover:bg-card shrink-0">
              <span className="text-xs">←</span>
            </button>
          )}
          
          {artifacts.length > 0 && (
            <div className="h-7 px-2 flex items-center gap-1.5 bg-accent text-accent-foreground border-2 border-border shrink-0">
              <span className="font-mono text-[10px] font-bold uppercase">{expertName}</span>
              <span className="text-[9px] opacity-70">({artifacts.length})</span>
            </div>
          )}
          
          {artifacts.length > 0 && <div className="w-px h-5 bg-border mx-1 shrink-0" />}
          
          <div ref={tabsRef} className="flex-1 flex items-end gap-1 overflow-x-auto scrollbar-hide min-w-0">
            {artifacts.length === 0 ? (
              <div className="h-7 px-4 flex items-center text-muted-foreground/60 text-xs font-mono">Waiting...</div>
            ) : (
              artifacts.map((artifact, idx) => (
                <button
                  key={`${artifact.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    onSelectArtifact(idx)
                  }}
                  className={cn(
                    "h-7 px-2 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer",
                    selectedIndex === idx
                      ? "h-8 bg-card border-2 border-border border-b-0 top-[2px] z-10 text-primary shadow-[0_-2px_0_0_hsl(var(--accent))]"
                      : "bg-panel border-2 border-border/30 border-b-0 opacity-60 hover:opacity-100 text-muted-foreground"
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

          {canScrollRight && (
            <button onClick={scrollRight} className="h-7 w-6 flex items-center justify-center bg-panel border-2 border-border hover:bg-card shrink-0">
              <span className="text-xs">→</span>
            </button>
          )}
        </div>
        
        {/* Right: Task status indicator (fixed) */}
        <div className="flex-none flex items-center pl-3 ml-2 border-l border-border/50 shrink-0">
          <TaskStatusIndicator />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 bg-card p-4 overflow-hidden relative min-h-0 min-w-0">
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
        <div className="absolute inset-4 border border-border bg-card shadow-sm flex flex-col overflow-hidden min-w-0">
          {!selectedArtifact ? (
            <EmptyState variant="detailed" />
          ) : (
            <ArtifactContent 
              artifact={selectedArtifact} 
              onToggleFullscreen={onToggleFullscreen}
              isFullscreen={isFullscreen}
            />
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="bg-primary text-primary-foreground border-t-2 border-border px-3 py-1.5 flex justify-between items-center text-[9px] font-mono shrink-0">
        <div className="flex gap-4">
          <span>CPU: 12%</span>
          <span>MEM: 402MB</span>
          <span className="text-accent">NET: CONNECTED</span>
        </div>
        <span>Ln 1, Col 1</span>
      </div>
    </div>
  )
}

// Artifact content rendering
interface ArtifactContentProps {
  artifact: Artifact
  onToggleFullscreen?: () => void
  isFullscreen?: boolean
}

function ArtifactContent({ artifact, onToggleFullscreen, isFullscreen }: ArtifactContentProps) {
  const [viewMode, setViewMode] = useState<'code' | 'preview'>(artifact.type === 'html' ? 'preview' : 'code')
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleCopy = useCallback(async () => {
    const text = artifact?.content || ''
    if (!text) return

    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // Silent fail
    }
  }, [artifact])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const canPreview = true

  const ArtifactLoader = () => (
    <div className="h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <div className="w-2 h-2 bg-accent animate-pulse" />
        <span>Loading...</span>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar - Bauhaus industrial style */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-1">
            <div className="w-3 h-3 bg-accent border border-border" />
            <div className="w-2 h-2 bg-card border-2 border-border" />
            <div className="w-1.5 h-1.5 bg-primary/60 border border-border/50" />
          </div>
          <div className="w-px h-4 bg-border mx-1" />
          <div className="flex items-center gap-1 text-[10px] font-mono text-primary uppercase">
            <FileCode className="w-3 h-3 text-accent" />
            <span className="font-bold">
              {artifact.language || artifact.type}
            </span>
          </div>
        </div>

        {/* Right toolbar buttons */}
        <div className="flex items-center gap-1">
          {canPreview && (
            <>
              <button
                onClick={() => setViewMode('code')}
                className={cn(
                  "w-7 h-7 flex items-center justify-center border-2 transition-all",
                  viewMode === 'code'
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-panel text-primary border-border hover:border-primary hover:bg-card"
                )}
                title="Code"
              >
                <Code2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={cn(
                  "w-7 h-7 flex items-center justify-center border-2 transition-all",
                  viewMode === 'preview'
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-panel text-primary border-border hover:border-primary hover:bg-card"
                )}
                title="Preview"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-border/50 mx-1" />
            </>
          )}

          <button
            onClick={handleCopy}
            className={cn(
              "w-7 h-7 flex items-center justify-center border-2 transition-all",
              copied
                ? "bg-green-500 text-white border-green-500"
                : "bg-panel text-primary border-border hover:border-primary hover:bg-card"
            )}
            title={copied ? 'Copied' : 'Copy'}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <div className="w-px h-4 bg-border/50 mx-1" />

          <button
            onClick={onToggleFullscreen}
            className={cn(
              "w-7 h-7 flex items-center justify-center border-2 transition-all",
              isFullscreen
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-panel text-primary border-border hover:border-primary hover:bg-card"
            )}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden min-h-0 min-w-0 relative">
        {viewMode === 'code' ? (
          <Suspense fallback={<ArtifactLoader />}>
            <div className="h-full w-full overflow-auto bauhaus-scrollbar p-0">
              <CodeArtifact content={artifact.content} language={artifact.language || artifact.type} className="h-full" />
            </div>
          </Suspense>
        ) : (
          <Suspense fallback={<ArtifactLoader />}>
            <div className="h-full w-full overflow-auto bauhaus-scrollbar p-4">
              {artifact.type === 'html' ? (
                <HtmlArtifact content={artifact.content} className="h-full" />
              ) : artifact.type === 'markdown' || artifact.content.includes('#') || artifact.content.includes('**') ? (
                <DocArtifact 
                  content={artifact.content} 
                  className="h-full" 
                  isStreaming={artifact.isStreaming}
                />
              ) : (
                <CodeArtifact content={artifact.content} language={artifact.language || artifact.type} className="h-full" />
              )}
            </div>
          </Suspense>
        )}
      </div>
    </div>
  )
}
