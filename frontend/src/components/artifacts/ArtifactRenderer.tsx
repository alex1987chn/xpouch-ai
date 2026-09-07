/**
 * ArtifactRenderer - 无 store 的产物渲染分发器
 *
 * 从 ArtifactDashboard 的渲染分支抽出（该组件直连 useTaskStore，无法在
 * 会话上下文之外复用）。产物中心 / 公开分享页等独立场景使用本组件。
 */

import { lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import CodeArtifact from './CodeArtifact'
import DocArtifact from './DocArtifact'
import HtmlArtifact from './HtmlArtifact'
import MediaArtifact from './MediaArtifact'

const ChartRenderer = lazy(() =>
  import('./renderers/ChartRenderer').then(m => ({ default: m.ChartRenderer }))
)
const MermaidRenderer = lazy(() =>
  import('./renderers/MermaidRenderer').then(m => ({ default: m.MermaidRenderer }))
)

interface ArtifactRendererProps {
  type: string
  language?: string | null
  title?: string | null
  content: string
  className?: string
}

function VisualLoading() {
  return (
    <div className="w-full h-full min-h-[200px] flex items-center justify-center text-content-muted text-sm">
      ...
    </div>
  )
}

export default function ArtifactRenderer({
  type,
  language,
  content,
  className,
}: ArtifactRendererProps) {
  const normalizedType = (type || 'text').toLowerCase()

  if (normalizedType === 'html') {
    return (
      <div className={cn('h-full', className)}>
        <HtmlArtifact content={content} />
      </div>
    )
  }

  if (normalizedType === 'image' || normalizedType === 'video' || normalizedType === 'media') {
    return (
      <MediaArtifact
        content={content}
        type={normalizedType as 'image' | 'video' | 'media'}
        className={className}
      />
    )
  }

  // markdown / 含结构特征的 text 走文档渲染，其余按代码高亮
  const isDocLike =
    normalizedType === 'markdown' || content.includes('# ') || content.includes('**')

  if (isDocLike) {
    return <DocArtifact content={content} className={className} />
  }

  if (normalizedType === 'mermaid' || normalizedType === 'json-chart') {
    return (
      <div className={cn('h-full w-full overflow-auto p-4 bg-surface-card', className)}>
        <Suspense fallback={<VisualLoading />}>
          {normalizedType === 'mermaid' ? (
            <MermaidRenderer code={content} />
          ) : (
            <ChartRenderer code={content} />
          )}
        </Suspense>
      </div>
    )
  }

  return (
    <div className={cn('h-full', className)}>
      <CodeArtifact content={content} language={language || normalizedType} />
    </div>
  )
}
