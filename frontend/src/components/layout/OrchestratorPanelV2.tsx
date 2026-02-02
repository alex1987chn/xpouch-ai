import { useState, lazy, Suspense, memo, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Maximize2, FileCode, LayoutGrid, MessageSquare, Cpu, CheckCircle2, Loader2, Clock, XCircle, Copy, Eye, Code, RefreshCw } from 'lucide-react'
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

// 状态图标组件
const StatusIcon = memo(({ status }: { status: string }) => {
  switch (status) {
    case 'running': return <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
    case 'completed': return <CheckCircle2 className="w-3 h-3 text-green-500" />
    case 'failed': return <XCircle className="w-3 h-3 text-red-500" />
    default: return <Clock className="w-3 h-3 text-muted-foreground" />
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

// Simple 模式 - 参考之前的设计风格
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
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* 顶部 ARC 标签 */}
      <div className="h-8 flex items-center justify-end px-2 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-muted-foreground px-2 py-1 border border-border">ARC</span>
          <button onClick={onToggleFullscreen} className="p-1 hover:bg-muted rounded">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 产物内容区域 */}
      <div className="flex-1 overflow-hidden">
        {!currentArtifact ? (
          <EmptyState />
        ) : (
          <ArtifactViewer artifact={currentArtifact} />
        )}
      </div>

      {/* 底部状态指示器 */}
      <div className="h-8 flex items-center justify-center gap-1 shrink-0">
        {artifacts.length > 0 ? (
          artifacts.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedArtifactIndex(idx)}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                selectedArtifactIndex === idx ? "bg-primary" : "bg-muted-foreground/30"
              )}
            />
          ))
        ) : (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          </>
        )}
      </div>
    </div>
  )
}

// 空状态组件
function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      {/* 方框图标 */}
      <div className="w-16 h-16 border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mb-4">
        <div className="w-8 h-8 border border-muted-foreground/20" />
      </div>
      
      {/* 文字 */}
      <p className="text-sm text-muted-foreground mb-2">暂无交付物</p>
      <p className="text-xs text-muted-foreground/60">等待 AI 生成代码、文档或 HTML</p>
      
      {/* 分隔线 */}
      <div className="w-32 h-px bg-border my-6" />
      
      {/* 状态点 */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
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

  const session = useTaskStore((state) => state.session)
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId)
  const selectTask = useTaskStore((state) => state.selectTask)
  const tasks = useTaskStore((state) => state.tasksCache)

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null

  // 自动选中第一个任务
  useEffect(() => {
    if (tasks.length > 0 && !selectedTaskId) {
      selectTask(tasks[0].id)
    }
  }, [tasks, selectedTaskId, selectTask])

  useEffect(() => {
    setSelectedArtifactIndex(0)
  }, [selectedTaskId])

  const handleTaskClick = useCallback((taskId: string) => {
    selectTask(taskId)
    setSelectedArtifactIndex(0)
  }, [selectTask])

  const handleArtifactClick = useCallback((idx: number) => {
    setSelectedArtifactIndex(idx)
  }, [])

  const currentArtifact = selectedTask && selectedTask.artifacts.length > 0
    ? selectedTask.artifacts[Math.min(selectedArtifactIndex, selectedTask.artifacts.length - 1)]
    : null

  return (
    <div className="flex-1 flex flex-col bg-card h-full">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border bg-muted/50 shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">任务执行</span>
          {session && (
            <span className="text-xs text-muted-foreground">
              {session.executionMode === 'sequential' ? '顺序执行' : '并行执行'}
            </span>
          )}
        </div>
        <button onClick={onToggleFullscreen} className="p-1.5 hover:bg-muted rounded">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content: 专家栏(左) | Artifact(右) */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：专家栏 */}
        <div className="w-14 border-r border-border bg-muted/20 flex flex-col items-center py-3 gap-2 overflow-y-auto">
          {tasks.map((task) => {
            const isSelected = selectedTaskId === task.id
            
            return (
              <button
                key={task.id}
                onClick={() => handleTaskClick(task.id)}
                className={cn(
                  "w-10 h-10 rounded-lg border-2 flex items-center justify-center relative transition-all",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:border-primary/50"
                )}
                title={`${task.expert_type} (${task.status})`}
              >
                <span className="font-bold text-xs">
                  {task.expert_type.slice(0, 2).toUpperCase()}
                </span>
                <div className="absolute -bottom-1 -right-1">
                  <StatusIcon status={task.status} />
                </div>
              </button>
            )
          })}
        </div>

        {/* 右侧：Artifact 区域 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Artifact Header */}
          <div className="h-9 flex items-center justify-between px-3 border-b border-border bg-muted/30 shrink-0">
            <div className="flex items-center gap-2">
              {!selectedTask ? (
                <span className="text-xs text-muted-foreground">选择专家查看产物</span>
              ) : selectedTask.artifacts.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {selectedTask.status === 'running' ? '正在生成...' : '暂无产物'}
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  {selectedTask.artifacts.map((artifact, idx) => (
                    <button
                      key={artifact.id}
                      onClick={() => handleArtifactClick(idx)}
                      className={cn(
                        "px-2 py-1 text-xs rounded transition-colors",
                        selectedArtifactIndex === idx
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      {artifact.title || `产物 ${idx + 1}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 工具按钮 */}
            {currentArtifact && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigator.clipboard.writeText(currentArtifact.content)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  title="复制"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Artifact Content */}
          <div className="flex-1 overflow-hidden">
            {!currentArtifact ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <LayoutGrid className="w-10 h-10 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {selectedTask ? '该专家暂无产物' : '选择专家查看产物'}
                  </p>
                </div>
              </div>
            ) : (
              <ArtifactViewer artifact={currentArtifact} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Artifact 查看器组件
interface ArtifactViewerProps {
  artifact: Artifact
}

function ArtifactViewer({ artifact }: ArtifactViewerProps) {
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code')
  const ArtifactLoader = () => <div className="h-full flex items-center justify-center text-sm text-muted-foreground">加载中...</div>

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-8 flex items-center justify-between px-3 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{artifact.title || '未命名产物'}</span>
          <span className="text-xs text-muted-foreground">({artifact.type})</span>
        </div>
        <div className="flex items-center gap-1">
          {/* 视图切换 */}
          <button
            onClick={() => setViewMode('code')}
            className={cn(
              "p-1.5 rounded transition-colors",
              viewMode === 'code' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title="源码"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          {(artifact.type === 'html' || artifact.type === 'markdown') && (
            <button
              onClick={() => setViewMode('preview')}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === 'preview' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="预览"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => navigator.clipboard.writeText(artifact.content)}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded"
            title="复制"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'preview' && artifact.type === 'html' ? (
          <iframe
            srcDoc={artifact.content}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            title={artifact.title || 'Preview'}
          />
        ) : viewMode === 'preview' && artifact.type === 'markdown' ? (
          <Suspense fallback={<ArtifactLoader />}>
            <div className="p-4">
              <DocArtifact content={artifact.content} />
            </div>
          </Suspense>
        ) : (
          <Suspense fallback={<ArtifactLoader />}>
            <ArtifactContent artifact={artifact} />
          </Suspense>
        )}
      </div>
    </div>
  )
}

// Artifact 内容组件
function ArtifactContent({ artifact }: { artifact: Artifact }) {
  switch (artifact.type) {
    case 'code':
      return <CodeArtifact content={artifact.content} language={artifact.language} />
    case 'markdown':
      return <DocArtifact content={artifact.content} />
    case 'html':
      return <HtmlArtifact content={artifact.content} />
    default:
      return (
        <div className="p-4">
          <pre className="text-sm whitespace-pre-wrap">{artifact.content}</pre>
        </div>
      )
  }
}
