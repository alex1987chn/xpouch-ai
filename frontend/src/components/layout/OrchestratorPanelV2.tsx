import { useState, lazy, Suspense, memo, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Maximize2, LayoutGrid, FileCode,
  Eye, Code2, Copy, Check, Loader2, CheckCircle2, Clock, XCircle
} from 'lucide-react'
import { useTaskStore } from '@/store/taskStore'
import type { Artifact, Task } from '@/store/taskStore'

const CodeArtifact = lazy(() => import('@/components/artifacts/CodeArtifact').then(m => ({ default: m.default })))
const DocArtifact = lazy(() => import('@/components/artifacts/DocArtifact').then(m => ({ default: m.default })))
const HtmlArtifact = lazy(() => import('@/components/artifacts/HtmlArtifact').then(m => ({ default: m.default })))

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
  const mode = useTaskStore((state) => state.mode)
  return mode === 'complex' 
    ? <ComplexModePanel {...{ isFullscreen, onToggleFullscreen }} />
    : <SimpleModePanel {...{ isFullscreen, onToggleFullscreen }} />
}

// Simple 模式 - 使用 taskStore 承载预览内容
const SIMPLE_TASK_ID = 'simple_session'

function SimpleModePanel({ isFullscreen, onToggleFullscreen }: OrchestratorPanelV2Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const tasks = useTaskStore((state) => state.tasksCache)
  const selectedTask = tasks.find(t => t.id === SIMPLE_TASK_ID)
  const artifacts = selectedTask?.artifacts || []
  const currentArtifact = artifacts[selectedIndex] || null

  // 调试输出
  console.log('[SimpleModePanel] tasks:', tasks.length, 'selectedTask:', selectedTask?.id, 'artifacts:', artifacts.length)

  // 当切换任务时重置选中索引
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

// Complex 模式
function ComplexModePanel({ isFullscreen, onToggleFullscreen }: OrchestratorPanelV2Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId)
  const selectTask = useTaskStore((state) => state.selectTask)
  const tasks = useTaskStore((state) => state.tasksCache)
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null

  useEffect(() => { if (tasks.length && !selectedTaskId) selectTask(tasks[0].id) }, [tasks, selectedTaskId, selectTask])
  useEffect(() => setSelectedIndex(0), [selectedTaskId])

  const currentArtifact = selectedTask?.artifacts[selectedIndex] || null

  return (
    <div className="flex-1 flex h-full bg-page">
      <ExpertRailComplex tasks={tasks} selectedTaskId={selectedTaskId} onTaskClick={selectTask} />
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

// 专家轨道 - Simple
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

// 专家轨道 - Complex
function ExpertRailComplex({ tasks, selectedTaskId, onTaskClick }: { 
  tasks: Task[], selectedTaskId: string | null, onTaskClick: (id: string) => void 
}) {
  return (
    <div className="flex-1 overflow-y-auto py-2">
      <div className="flex flex-col items-center gap-3">
        {tasks.map((task, idx) => {
          const isActive = selectedTaskId === task.id || (!selectedTaskId && idx === 0)
          const label = expertLabels[task.expert_type] || expertLabels.default
          return (
            <div key={task.id} className="group relative w-full flex justify-center">
              {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-border z-20" />}
              <button onClick={() => onTaskClick(task.id)}
                className={cn("w-10 h-10 border-2 flex items-center justify-center transition-all relative z-10",
                  isActive ? "border-border bg-card shadow-[2px_2px_0_0_rgba(0,0,0,0.2)]" : "border-border/60 bg-page/80 hover:border-border")}>
                <span className={cn("font-black text-xs", isActive ? "text-primary" : "text-muted-foreground")}>{label}</span>
              </button>
              <div className={cn("absolute left-14 top-2 bg-primary text-primary-foreground text-[9px] px-2 py-1 whitespace-nowrap z-50 border",
                "opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity")}>
                {task.expert_type} ({task.status})
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Artifact 仪表盘
interface ArtifactDashboardProps {
  expertName: string
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  selectedIndex: number
  onSelectArtifact: (index: number) => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

// 任务状态指示器 - 显示在 Level 1 右侧
function TaskStatusIndicator() {
  const runningTask = useTaskStore((state) => {
    const tasks = state.tasksCache
    return tasks.find((t) => t.status === 'running')
  })
  const mode = useTaskStore((state) => state.mode)

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
    const allCompleted = useTaskStore.getState().tasksCache.every(
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
      {/* 呼吸灯 */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
      
      {/* 专家名称 + 描述 */}
      <span className="text-primary truncate max-w-[150px]">
        {runningTask.expert_type}
      </span>
      
      {/* 状态 */}
      <span className="text-muted-foreground">running</span>
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
      {/* Tab 栏 - 左右分栏：左侧 Tabs，右侧状态 */}
      <div className="h-10 flex items-center justify-between border-b-2 border-border bg-panel shrink-0 px-2">
        {/* 左侧：Tabs 区域（自适应 + 可滚动） */}
        <div className="flex-1 flex items-center gap-1 min-w-0 mr-4">
          {canScrollLeft && (
            <button onClick={scrollLeft} className="h-7 w-6 flex items-center justify-center bg-panel border-2 border-border hover:bg-card shrink-0">
              <span className="text-xs">←</span>
            </button>
          )}
          
          {artifacts.length > 0 && (
            <div className="h-7 px-3 flex items-center gap-2 bg-accent text-accent-foreground border-2 border-border shrink-0">
              <span className="font-mono text-xs font-bold uppercase">{expertName}</span>
              <span className="text-[10px] opacity-70">({artifacts.length})</span>
            </div>
          )}
          
          {artifacts.length > 0 && <div className="w-px h-5 bg-border mx-1 shrink-0" />}
          
          <div ref={tabsRef} className="flex-1 flex items-end gap-1 overflow-x-auto scrollbar-hide">
            {artifacts.length === 0 ? (
              <div className="h-7 px-4 flex items-center text-muted-foreground/60 text-xs font-mono">等待交付物...</div>
            ) : (
              artifacts.map((artifact, idx) => (
                <button
                  key={artifact.id}
                  onClick={() => onSelectArtifact(idx)}
                  className={cn(
                    "h-7 px-3 flex items-center gap-2 transition-all shrink-0",
                    selectedIndex === idx
                      ? "h-8 bg-card border-2 border-border border-b-0 top-[2px] z-10 text-primary shadow-[0_-2px_0_0_hsl(var(--accent))]"
                      : "bg-panel border-2 border-border/30 border-b-0 opacity-60 hover:opacity-100 text-muted-foreground"
                  )}
                >
                  <FileCode className="w-3 h-3" />
                  <span className="font-mono text-xs font-bold truncate max-w-[100px]">
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
        
        {/* 右侧：任务状态指示器（固定不动） */}
        <div className="flex-none flex items-center px-2 border-l border-border/50">
          <TaskStatusIndicator />
        </div>
      </div>

      {/* 内容区 - 使用主题滚动条 */}
      <div className="flex-1 bg-card p-4 overflow-hidden relative min-h-0 min-w-0">
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
        <div className="absolute inset-4 border border-border bg-card shadow-sm flex flex-col overflow-hidden min-w-0">
          {!selectedArtifact ? (
            <EmptyState />
          ) : (
            <ArtifactContent 
              artifact={selectedArtifact} 
              onToggleFullscreen={onToggleFullscreen}
              isFullscreen={isFullscreen}
            />
          )}
        </div>
      </div>

      {/* 底部状态栏 */}
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

// 空状态
function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-border/30 bg-panel/50">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 border-2 border-border bg-card shadow-hard flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary">暂无交付物</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            等待专家生成交付物。任务进行时，交付物将显示在这里。
          </p>
        </div>
        <div className="flex justify-center gap-2 pt-4">
          <div className="w-2 h-2 bg-border/30" />
          <div className="w-2 h-2 bg-border/50" />
          <div className="w-2 h-2 bg-accent" />
          <div className="w-2 h-2 bg-border/50" />
          <div className="w-2 h-2 bg-border/30" />
        </div>
        <div className="pt-4 border-t border-border/20">
          <div className="text-[9px] font-mono text-muted-foreground/70">
            STATUS: <span className="text-accent">WAITING_FOR_TASK</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Artifact 内容渲染
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

    // 清除之前的 timer
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }, [artifact])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const canPreview = ['markdown', 'html', 'code'].includes(artifact.type)

  const ArtifactLoader = () => (
    <div className="h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <div className="w-2 h-2 bg-accent animate-pulse" />
        <span>加载中...</span>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 - Bauhaus 工业风格 */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-panel shrink-0">
        {/* 左侧装饰性图标 */}
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-1">
            <div className="w-3 h-3 bg-accent border border-border" />
            <div className="w-2 h-2 bg-card border-2 border-border" />
            <div className="w-1.5 h-1.5 bg-primary/60 border border-border/50" />
          </div>
          <div className="w-px h-4 bg-border mx-1" />
          <div className="flex items-center gap-1 text-[10px] font-mono text-primary uppercase">
            <FileCode className="w-3 h-3 text-accent" />
            <span className="font-bold">{artifact.type}</span>
          </div>
        </div>

        {/* 右侧工具按钮 - 无文字 */}
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
                title="代码"
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
                title="预览"
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
            title={copied ? '已复制' : '复制'}
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
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 内容区域 - 确保不会溢出 */}
      <div className="flex-1 overflow-hidden min-h-0 min-w-0 relative">
        {viewMode === 'code' ? (
          <Suspense fallback={<ArtifactLoader />}>
            <div className="h-full w-full overflow-auto bauhaus-scrollbar">
              <CodeArtifact content={artifact.content} language={artifact.language || artifact.type} />
            </div>
          </Suspense>
        ) : (
          <Suspense fallback={<ArtifactLoader />}>
            <div className="h-full w-full overflow-auto bauhaus-scrollbar p-4">
              {artifact.type === 'markdown' ? (
                <DocArtifact content={artifact.content} />
              ) : artifact.type === 'html' ? (
                <HtmlArtifact content={artifact.content} />
              ) : (
                <CodeArtifact content={artifact.content} language={artifact.language || artifact.type} />
              )}
            </div>
          </Suspense>
        )}
      </div>
    </div>
  )
}
