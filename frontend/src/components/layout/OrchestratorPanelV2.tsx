import { useState, lazy, Suspense, memo, useCallback, useEffect } from 'react'
import { shallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { Maximize2, FileCode, LayoutGrid, MessageSquare, Cpu, CheckCircle2, Loader2, Clock, XCircle, Copy, Eye, Code, FileText } from 'lucide-react'
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

// 专家名称映射
const expertNameMap: Record<string, string> = {
  'planner': '规划师',
  'coder': '程序员',
  'analyst': '分析师',
  'writer': '写手',
  'researcher': '研究员',
  'search': '搜索',
  'image_analyzer': '图像分析'
}

// 获取专家显示名称
function getExpertDisplayName(type: string): string {
  return expertNameMap[type] || type.slice(0, 6)
}

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
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code')

  // 分别订阅 taskStore 的状态，避免 shallow 比较失败
  const session = useTaskStore((state) => state.session)
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId)
  const selectTask = useTaskStore((state) => state.selectTask)
  const tasks = useTaskStore((state) => state.tasksCache)  // 订阅缓存的数组

  // 计算当前选中的 task
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null

  // 自动选中第一个任务（当没有选中任何任务时）
  useEffect(() => {
    if (tasks.length > 0 && !selectedTaskId) {
      selectTask(tasks[0].id)
    }
  }, [tasks, selectedTaskId, selectTask])

  // 重置 artifact 索引当切换任务时
  useEffect(() => {
    setSelectedArtifactIndex(0)
  }, [selectedTaskId])

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

      {/* 主内容区：专家列表(左栏) | Artifact */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：专家列表（窄栏） */}
        <div className="w-20 border-r-2 border-border bg-page flex flex-col py-2 overflow-y-auto">
          <div className="w-full px-2 mb-2">
            <span className="text-[9px] font-mono text-muted-foreground">专家</span>
          </div>

          <div className="flex-1 flex flex-col items-center gap-2">
            {tasks.map((task, index) => {
              const isSelected = selectedTaskId === task.id
              const isFirst = index === 0

              return (
                <div key={task.id} className="group relative w-full flex flex-col items-center px-1">
                  {/* 选中指示器 */}
                  {isSelected && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary" />
                  )}

                  {/* 第一顺位默认高亮 */}
                  {isFirst && !selectedTaskId && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary/50" />
                  )}

                  <button
                    onClick={() => handleTaskClick(task.id)}
                    className={cn(
                      "w-14 h-14 border-2 flex flex-col items-center justify-center transition-all relative rounded-lg",
                      isSelected
                        ? "border-primary bg-card shadow-hard"
                        : isFirst && !selectedTaskId
                          ? "border-primary/60 bg-card/80"
                          : "border-border/60 bg-page/80 hover:border-border hover:bg-card"
                    )}
                    title={task.expert_type}
                  >
                    {/* 专家头像（首字母） */}
                    <span className={cn(
                      "font-black text-sm",
                      isSelected ? "text-primary" : "text-secondary"
                    )}>
                      {task.expert_type.slice(0, 2).toUpperCase()}
                    </span>

                    {/* 状态指示器 */}
                    <div className="absolute -bottom-1 -right-1">
                      <StatusIcon status={task.status} />
                    </div>
                  </button>

                  {/* 专家名称 */}
                  <span className={cn(
                    "text-[9px] font-mono mt-1 truncate w-full text-center px-1",
                    isSelected ? "text-primary font-bold" : "text-muted-foreground"
                  )}>
                    {getExpertDisplayName(task.expert_type)}
                  </span>

                  {/* Tooltip */}
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-popover text-popover-foreground text-[10px] px-2 py-1 whitespace-nowrap z-50 border border-border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity rounded shadow-lg">
                    {task.expert_type} ({task.status})
                    {task.artifacts.length > 0 && ` • ${task.artifacts.length} 产物`}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex-1 w-[1px] bg-border/30 border-l border-dashed border-border/30 min-h-[20px] my-2 mx-auto" />
        </div>

        {/* 右侧：Artifact 展示区 */}
        <div className="flex-1 flex flex-col min-w-0 bg-page">
          {/* Artifact Tabs */}
          <div className="h-10 flex items-end px-2 gap-1 border-b-2 border-border bg-panel shrink-0">
            {!selectedTask ? (
              <div className="h-7 px-4 flex items-center text-secondary/60 text-xs font-mono">选择专家查看产物</div>
            ) : selectedTask.artifacts.length === 0 ? (
              <div className="h-7 px-4 flex items-center text-secondary/60 text-xs font-mono">
                {selectedTask.status === 'running' ? '正在生成产物...' : '该专家暂无产物'}
              </div>
            ) : (
              <>
                {selectedTask.artifacts.map((artifact, idx) => (
                  <button
                    key={artifact.id}
                    onClick={() => handleArtifactClick(idx)}
                    className={cn(
                      "h-7 px-3 flex items-center gap-2 transition-all shrink-0",
                      selectedArtifactIndex === idx
                        ? "h-8 bg-card border-2 border-border border-b-0 z-10 text-primary"
                        : "bg-panel border-2 border-border/30 border-b-0 opacity-60 hover:opacity-80"
                    )}
                  >
                    <FileCode className="w-3 h-3" />
                    <span className="font-mono text-xs font-bold truncate max-w-[120px]">{artifact.title || `Artifact-${idx + 1}`}</span>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Artifact 工具栏 */}
          {currentArtifact && (
            <div className="h-8 flex items-center justify-between px-3 border-b border-border bg-panel/50 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">{currentArtifact.type.toUpperCase()}</span>
                <span className="text-xs text-muted-foreground">{currentArtifact.title}</span>
              </div>
              <div className="flex items-center gap-1">
                {/* 预览/代码切换 */}
                <button
                  onClick={() => setViewMode('code')}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    viewMode === 'code' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                  title="查看源码"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    viewMode === 'preview' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                  title="预览"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-border mx-1" />
                {/* 复制按钮 */}
                <button
                  onClick={() => navigator.clipboard.writeText(currentArtifact.content)}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                  title="复制内容"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Artifact 内容区 */}
          <div className="flex-1 p-4 overflow-hidden">
            <div className="w-full h-full border-2 border-border bg-card shadow-hard relative">
              {!currentArtifact ? (
                <div className="h-full flex flex-col items-center justify-center text-secondary/60">
                  <LayoutGrid className="w-12 h-12 mb-4 opacity-30" />
                  <p className="text-xs font-mono">
                    {selectedTask ? '该专家暂无产物' : '选择专家查看产物'}
                  </p>
                </div>
              ) : (
                <ArtifactContent artifact={currentArtifact} viewMode={viewMode} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="bg-primary text-primary-foreground border-t-2 border-border px-3 py-1.5 flex justify-between items-center text-[9px] font-mono shrink-0">
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

interface ArtifactContentProps {
  artifact: Artifact
  viewMode?: 'code' | 'preview'
}

function ArtifactContent({ artifact, viewMode = 'code' }: ArtifactContentProps) {
  const ArtifactLoader = () => <div className="h-full flex items-center justify-center text-xs font-mono">Loading...</div>

  // 根据 viewMode 渲染不同内容
  if (viewMode === 'preview' && artifact.type === 'html') {
    return (
      <div className="h-full w-full">
        <iframe
          srcDoc={artifact.content}
          className="w-full h-full border-0"
          sandbox="allow-scripts"
          title={artifact.title || 'HTML Preview'}
        />
      </div>
    )
  }

  if (viewMode === 'preview' && artifact.type === 'markdown') {
    return (
      <Suspense fallback={<ArtifactLoader />}>
        <div className="h-full overflow-auto p-4">
          <DocArtifact content={artifact.content} />
        </div>
      </Suspense>
    )
  }

  // 默认显示代码视图
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
