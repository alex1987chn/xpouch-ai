import { useMemo } from 'react'
import { useArtifacts } from '@/providers/ArtifactProvider'
import { cn } from '@/lib/utils'
import { Code, FileText, Search, Globe, Type } from 'lucide-react'
import type { Artifact } from '@/types'

// ============================================
// ArtifactTabs - 类似浏览器的 Tab 切换
// ============================================

interface ArtifactTabsProps {
  className?: string
}

// Artifact 类型图标映射
const ARTIFACT_ICONS = {
  code: Code,
  markdown: FileText,
  search: Search,
  html: Globe,
  text: Type
}

// 生成 Tab 标题
function getTabTitle(artifact: Artifact, index: number, total: number): string {
  // 优先使用 artifact 的自定义标题
  if (artifact.title) {
    return truncateTitle(artifact.title)
  }

  // 根据类型生成默认标题
  const typeNames: Record<Artifact['type'], string> = {
    code: '代码',
    markdown: '文档',
    search: '搜索结果',
    html: 'HTML',
    text: '文本'
  }

  const typeName = typeNames[artifact.type]
  const showNumber = total > 1
  const title = showNumber ? `${typeName} ${index + 1}` : typeName

  return truncateTitle(title)
}

// 截断标题，最多显示10个字符
function truncateTitle(title: string): string {
  if (title.length <= 10) {
    return title
  }
  return title.substring(0, 10) + '...'
}

export default function ArtifactTabs({ className }: ArtifactTabsProps) {
  const { currentSession, switchArtifact } = useArtifacts()

  // 如果没有会话或 artifacts，不渲染
  if (!currentSession || currentSession.artifacts.length === 0) {
    return null
  }

  const { artifacts, currentIndex } = currentSession
  const showTabs = artifacts.length > 1

  return (
    <div className={cn(
      'flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded-lg',
      !showTabs && 'hidden',  // 只有一个 artifact 时不显示 tabs
      className
    )}>
      {artifacts.map((artifact, index) => {
        const Icon = ARTIFACT_ICONS[artifact.type]
        const isActive = index === currentIndex
        const title = getTabTitle(artifact, index, artifacts.length)

        return (
          <button
            key={artifact.id}
            onClick={() => switchArtifact(index)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              'whitespace-nowrap',
              isActive
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            )}
            title={title}
          >
            {Icon && <Icon className="w-4 h-4" />}
            <span>{title}</span>
          </button>
        )
      })}
    </div>
  )
}
