/**
 * =============================
 * 编排器面板 V2 (OrchestratorPanelV2)
 * =============================
 *
 * [架构层级] Layer 3 - 布局组件
 *
 * [功能描述]
 * 复杂模式下的右侧面板，集成新的任务系统：
 * - 专家任务列表（ExpertTaskList）
 * - 产物展示（ArtifactViewer）
 *
 * [样式风格] Bauhaus Industrial
 */

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Maximize2, Minimize2, FileText } from 'lucide-react'
import { ExpertTaskList } from '@/components/chat/ExpertTaskList'
import { useTaskStore, useSelectedTask } from '@/store/taskStore'
import { useTranslation } from '@/i18n'

// 产物类型图标
const artifactTypeIcons: Record<string, string> = {
  code: '</>',
  html: 'H',
  markdown: 'M',
  json: '{}',
  text: 'T'
}

interface OrchestratorPanelV2Props {
  /** 是否全屏 */
  isFullscreen?: boolean
  /** 切换全屏回调 */
  onToggleFullscreen?: () => void
  className?: string
}

/**
 * 产物查看器
 */
function ArtifactViewer() {
  const { t } = useTranslation()
  const task = useSelectedTask()
  const [selectedArtifactIndex, setSelectedArtifactIndex] = useState(0)

  // 获取当前任务的产物
  const artifacts = task?.artifacts || []
  const selectedArtifact = artifacts[selectedArtifactIndex]

  // 如果没有产物，显示空状态
  if (!task || artifacts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30 border-2 border-dashed border-border/50 m-4">
        <div className="text-center">
          <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">
            {task ? 'NO ARTIFACTS' : 'SELECT A TASK'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 产物标签栏 */}
      {artifacts.length > 1 && (
        <div className="flex items-center gap-1 p-2 border-b-2 border-border bg-card overflow-x-auto">
          {artifacts.map((artifact, index) => (
            <button
              key={artifact.id}
              onClick={() => setSelectedArtifactIndex(index)}
              className={cn(
                'px-3 py-1.5 text-xs font-mono border-2 transition-colors whitespace-nowrap',
                selectedArtifactIndex === index
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:bg-muted'
              )}
            >
              <span className="mr-2">{artifactTypeIcons[artifact.type] || '?'}</span>
              <span>{artifact.title || `${artifact.type}_${index + 1}`}</span>
            </button>
          ))}
        </div>
      )}

      {/* 产物内容 */}
      <div className="flex-1 overflow-auto p-4 bg-card">
        {selectedArtifact && (
          <div className="h-full">
            {/* 产物头部 */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <div>
                <h3 className="text-sm font-bold font-mono">
                  {selectedArtifact.title || 'UNTITLED'}
                </h3>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  TYPE: {selectedArtifact.type.toUpperCase()}
                  {selectedArtifact.language && ` | LANG: ${selectedArtifact.language}`}
                </p>
              </div>
            </div>

            {/* 产物内容 */}
            <ArtifactContent artifact={selectedArtifact} />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 产物内容渲染
 */
function ArtifactContent({ artifact }: { artifact: { type: string; content: string; language?: string } }) {
  // 根据类型渲染不同内容
  switch (artifact.type) {
    case 'code':
      return (
        <pre className="bg-muted p-4 rounded font-mono text-xs overflow-auto">
          <code>{artifact.content}</code>
        </pre>
      )
    case 'html':
      return (
        <div className="space-y-4">
          <div className="border-2 border-border bg-white dark:bg-black p-2">
            <iframe
              srcDoc={artifact.content}
              className="w-full h-64 bg-white"
              sandbox="allow-scripts"
              title="HTML Preview"
            />
          </div>
          <pre className="bg-muted p-4 rounded font-mono text-xs overflow-auto">
            <code>{artifact.content}</code>
          </pre>
        </div>
      )
    case 'markdown':
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {/* TODO: 使用 Markdown 渲染组件 */}
          <pre className="bg-muted p-4 rounded font-mono text-xs overflow-auto whitespace-pre-wrap">
            {artifact.content}
          </pre>
        </div>
      )
    default:
      return (
        <pre className="bg-muted p-4 rounded font-mono text-xs overflow-auto whitespace-pre-wrap">
          {artifact.content}
        </pre>
      )
  }
}

/**
 * 编排器面板 V2
 */
export function OrchestratorPanelV2({
  isFullscreen,
  onToggleFullscreen,
  className
}: OrchestratorPanelV2Props) {
  const { t } = useTranslation()
  const session = useTaskStore((state) => state.session)

  // 如果没有任务会话，显示空状态
  if (!session) {
    return (
      <div className={cn('flex flex-col h-full bg-card border-l-2 border-border', className)}>
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border">
          <h2 className="text-sm font-bold font-mono">ORCHESTRATOR</h2>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="w-8 h-8 flex items-center justify-center border-2 border-border hover:bg-muted transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground font-mono">WAITING FOR TASK...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full bg-card border-l-2 border-border', className)}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold font-mono">ORCHESTRATOR</h2>
          <span className="text-[10px] font-mono text-muted-foreground">
            /// {session.session_id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="w-8 h-8 flex items-center justify-center border-2 border-border hover:bg-muted transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* 内容区：任务列表 + 产物查看器 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：任务列表 */}
        <div className="w-72 border-r-2 border-border">
          <ExpertTaskList />
        </div>

        {/* 右侧：产物查看器 */}
        <ArtifactViewer />
      </div>
    </div>
  )
}

export default OrchestratorPanelV2
