import { useState, lazy, Suspense, memo, useCallback, useMemo, useRef } from 'react'
import { shallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { Maximize2, FileCode, LayoutGrid, MessageSquare, Cpu, CheckCircle2, Loader2, Clock, XCircle } from 'lucide-react'
import { useTaskStore } from '@/store/taskStore'
import { useCanvasStore } from '@/store/canvasStore'
import type { Artifact, Task } from '@/store/taskStore'

// Artifact 组件懒加载
const CodeArtifact = lazy(() => import('@/components/artifacts/CodeArtifact').then(m => ({ default: m.default })))
const DocArtifact = lazy(() => import('@/components/artifacts/DocArtifact').then(m => ({ default: m.default })))
const HtmlArtifact = lazy(() => import('@/components/artifacts/HtmlArtifact').then(m => ({ default: m.default })))

interface OrchestratorPanelV2Props {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

// 状态图标组件 - 稳定的引用
const StatusIcon = memo(({ status }: { status: string }) => {
  switch (status) {
    case 'running': return <Loader2 className="w-3 h-3 animate-spin" />
    case 'completed': return <CheckCircle2 className="w-3 h-3 text-green-500" />
    case 'failed': return <XCircle className="w-3 h-3 text-red-500" />
    default: return <Clock className="w-3 h-3" />
  }
})

export default function OrchestratorPanelV2({
  isFullscreen,
  onToggleFullscreen,
}: OrchestratorPanelV2Props) {
  const mode = useTaskStore((state) => state.mode)
  const isComplexMode = mode === 'complex'

  if (!isComplexMode) {
    return <SimpleModePanel isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
  }

  return <ComplexModePanel isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
}

// Simple 模式
function SimpleModePanel({
  isFullscreen,
  onToggleFullscreen,
}: {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  const [selectedArtifactIndex, setSelectedArtifactIndex] = useState(0)
  
  const canvasStore = useCanvasStore.getState()
  const artifactSessions = canvasStore.artifactSessions
  const selectedExpertSession = canvasStore.selectedExpertSession
  
  const currentSession = selectedExpertSession 
    ? artifactSessions.find(s => s.expertType === selectedExpertSession)
    : artifactSessions[0]
  
  const artifacts = currentSession?.artifacts || []
  const currentArtifact = artifacts.length > 0 
    ? artifacts[Math.min(selectedArtifactIndex, artifacts.length - 1)]
    : null

  return (
    <div className="flex-1 flex flex-col bg-card h-full">
      <div className="h-10 flex items-center justify-between px-3 border-b-2 border-border bg-panel shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono font-bold uppercase">Direct Chat</span>
          <span className="text-[10px] font-mono text-muted-foreground ml-2">SIMPLE MODE</span>
        </div>
        <button onClick={onToggleFullscreen} className="w-7 h-7 flex items-center justify-center border-2 border-border hover:bg-card">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-10 flex items-end px-2 gap-1 border-b-2 border-border bg-panel shrink-0">
          {artifacts.length === 0 ? (
            <div className="h-7 px-4 flex items-center text-secondary/60 text-xs font-mono">等待生成产物...</div>
          ) : (
            artifacts.map((artifact, idx) => (
              <button
                key={artifact.id}
                onClick={() => setSelectedArtifactIndex(idx)}
                className={cn(
                  "h-7 px-3 flex items-center gap-2 transition-all shrink-0",
                  selectedArtifactIndex === idx
                    ? "h-8 bg-card border-2 border-border border-b-0 z-10 text-primary"
                    : "bg-panel border-2 border-border/30 border-b-0 opacity-60"
                )}
              >
                <FileCode className="w-3 h-3" />
                <span className="font-mono text-xs font-bold truncate max-w-[120px]">
                  {artifact.title || `Artifact-${idx + 1}`}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex-1 p-4 overflow-hidden">
          <div className="w-full h-full border-2 border-border bg-card shadow-hard relative">
            {!currentArtifact ? (
              <div className="h-full flex items-center justify-center p-8">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 border-2 border-border bg-card shadow-hard flex items-center justify-center mx-auto">
                    <FileCode className="w-8 h-8 text-secondary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase text-primary">No Artifacts</h3>
                    <p className="text-xs text-secondary mt-2">等待 AI 生成代码、文档或 HTML</p>
                  </div>
                  <div className="pt-4 border-t border-border/20">
                    <div className="text-[9px] font-mono text-secondary/60 space-y-1">
                      <p>STATUS: <span className="text-yellow-500">WAITING</span></p>
                      <p>MODE: SIMPLE</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <ArtifactContent artifact={currentArtifact} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Complex 模式
function ComplexModePanel({
  isFullscreen,
  onToggleFullscreen,
}: {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  const [selectedArtifactIndex, setSelectedArtifactIndex] = useState(0)

  // 订阅 taskStore - 使用选择器缓存结果
  const { session, selectedTaskId, selectTask } = useTaskStore(
    (state) => ({
      session: state.session,
      selectedTaskId: state.selectedTaskId,
      selectTask: state.selectTask
    }),
    shallow
  )

  // 订阅 tasks，使用 getAllTasks 方法（已经排序）
  // 使用 useRef 缓存结果，避免每次都创建新数组
  const tasksRef = useRef<Task[] | null>(null)
  const prevTasksRef = useRef<Map<string, Task> | null>(null)

  const tasksMap = useTaskStore((state) => state.tasks)

  // 只在 tasksMap 实际变化时才重新计算
  if (tasksMap !== prevTasksRef.current) {
    prevTasksRef.current = tasksMap
    tasksRef.current = Array.from(tasksMap.values()).sort((a, b) => a.sort_order - b.sort_order)
  }

  const tasks = tasksRef.current || []

  // 计算当前选中的 task
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null

  // 使用 useCallback 缓存点击处理函数
  const handleTaskClick = useCallback((taskId: string) => {
    selectTask(taskId)
    setSelectedArtifactIndex(0)
  }, [selectTask])

  const handleArtifactClick = useCallback((idx: number) => {
    setSelectedArtifactIndex(idx)
  }, [])
  
  // 计算进度
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed' || t.status === 'failed').length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  // 当前选中的产物
  const currentArtifact = selectedTask && selectedTask.artifacts.length > 0
    ? selectedTask.artifacts[Math.min(selectedArtifactIndex, selectedTask.artifacts.length - 1)]
    : null

  return (
    <div className="flex-1 flex flex-col bg-card h-full">
      {/* 头部 */}
      <div className="h-10 flex items-center justify-between px-3 border-b-2 border-border bg-panel shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono font-bold uppercase">Task Orchestrator</span>
          {session && <span className="text-[10px] font-mono text-muted-foreground ml-2">{session.executionMode.toUpperCase()}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono">{progress}%</span>
          <button onClick={onToggleFullscreen} className="w-7 h-7 flex items-center justify-center border-2 border-border hover:bg-card">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 主内容区：Artifact | 专家列表(窄栏) */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：Artifact 展示区 */}
        <div className="flex-1 flex flex-col min-w-0 bg-page">
          {/* Artifact Tabs */}
          <div className="h-10 flex items-end px-2 gap-1 border-b-2 border-border bg-panel shrink-0">
            {!selectedTask ? (
              <div className="h-7 px-4 flex items-center text-secondary/60 text-xs font-mono">选择专家查看产物</div>
            ) : selectedTask.artifacts.length === 0 ? (
              <div className="h-7 px-4 flex items-center text-secondary/60 text-xs font-mono">该专家暂无产物</div>
            ) : (
              selectedTask.artifacts.map((artifact, idx) => (
                <button
                  key={artifact.id}
                  onClick={() => handleArtifactClick(idx)}
                  className={cn(
                    "h-7 px-3 flex items-center gap-2 transition-all shrink-0",
                    selectedArtifactIndex === idx
                      ? "h-8 bg-card border-2 border-border border-b-0 z-10 text-primary"
                      : "bg-panel border-2 border-border/30 border-b-0 opacity-60"
                  )}
                >
                  <FileCode className="w-3 h-3" />
                  <span className="font-mono text-xs font-bold truncate max-w-[100px]">{artifact.title || `Artifact-${idx + 1}`}</span>
                </button>
              ))
            )}
          </div>

          {/* Artifact 内容区 */}
          <div className="flex-1 p-4 overflow-hidden">
            <div className="w-full h-full border-2 border-border bg-card shadow-hard relative">
              {!currentArtifact ? (
                <div className="h-full flex items-center justify-center text-secondary/60">
                  <LayoutGrid className="w-12 h-12 mb-4 opacity-30" />
                  <p className="text-xs font-mono ml-2">选择专家查看产物</p>
                </div>
              ) : (
                <ArtifactContent artifact={currentArtifact} />
              )}
            </div>
          </div>
        </div>

        {/* 右侧：专家列表（窄栏） */}
        <div className="w-16 border-l-2 border-border bg-page flex flex-col items-center py-2 overflow-y-auto">
          <div className="w-[1px] h-4 bg-border/50 mb-2" />
          
          <div className="flex-1 flex flex-col items-center gap-2">
            {tasks.map((task) => {
              const isSelected = selectedTaskId === task.id
              
              return (
                <div key={task.id} className="group relative w-full flex justify-center">
                  {isSelected && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary" />
                  )}
                  
                  <button
                    onClick={() => handleTaskClick(task.id)}
                    className={cn(
                      "w-10 h-10 border-2 flex items-center justify-center transition-all relative",
                      isSelected
                        ? "border-primary bg-card shadow-hard"
                        : "border-border/60 bg-page/80 hover:border-border hover:bg-card"
                    )}
                    title={task.expert_type}
                  >
                    <span className={cn(
                      "font-black text-[10px]",
                      isSelected ? "text-primary" : "text-secondary"
                    )}>
                      {task.expert_type.slice(0, 2).toUpperCase()}
                    </span>
                  </button>
                  
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <StatusIcon status={task.status} />
                  </div>
                  
                  <div className="absolute right-12 top-1 bg-primary text-inverted text-[9px] px-2 py-1 whitespace-nowrap z-50 border border-border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    {task.expert_type} ({task.status})
                  </div>
                </div>
              )
            })}
          </div>
          
          <div className="flex-1 w-[1px] bg-border/30 border-l border-dashed border-border/30 min-h-[20px]" />
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="bg-primary text-inverted border-t-2 border-border px-3 py-1.5 flex justify-between items-center text-[9px] font-mono shrink-0">
        <div className="flex gap-4">
          <span>TOTAL: {tasks.length}</span>
          <span className="text-yellow-300">RUN: {tasks.filter((t) => t.status === 'running').length}</span>
          <span className="text-green-300">OK: {tasks.filter((t) => t.status === 'completed').length}</span>
          <span className="text-red-300">ERR: {tasks.filter((t) => t.status === 'failed').length}</span>
        </div>
        {session && <span>SESSION: {session.sessionId.slice(0, 8)}...</span>}
      </div>
    </div>
  )
}

function ArtifactContent({ artifact }: { artifact: Artifact }) {
  const ArtifactLoader = () => <div className="h-full flex items-center justify-center text-xs font-mono">Loading...</div>

  switch (artifact.type) {
    case 'code':
      return <Suspense fallback={<ArtifactLoader />}><CodeArtifact content={artifact.content} language={artifact.language} /></Suspense>
    case 'markdown':
      return <Suspense fallback={<ArtifactLoader />}><div className="h-full overflow-auto p-4"><DocArtifact content={artifact.content} /></div></Suspense>
    case 'html':
      return <Suspense fallback={<ArtifactLoader />}><div className="h-full overflow-auto p-4"><HtmlArtifact content={artifact.content} /></div></Suspense>
    default:
      return <div className="h-full flex items-center justify-center p-4"><pre className="text-xs font-mono whitespace-pre-wrap">{artifact.content}</pre></div>
  }
}
