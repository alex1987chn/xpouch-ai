import { useMemo, useRef, useState, useEffect } from 'react'
import { useArtifacts } from '@/providers/ArtifactProvider'
import { cn } from '@/lib/utils'
import { Code, FileText, Search, Globe, Type, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Artifact } from '@/types'

// ============================================
// ArtifactTabs - 类似浏览器的 Tab 切换，支持左右滚动
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
function getTabTitle(artifact: Artifact, index: number, allArtifacts: Artifact[]): string {
  // 根据类型生成标题，统一格式为"类型+数字"
  const typeNames: Record<Artifact['type'], string> = {
    code: '代码',
    markdown: '文档',
    search: '搜索结果',
    html: 'HTML',
    text: '文本'
  }

  const typeName = typeNames[artifact.type]

  // 计算该类型在所有artifacts中的索引
  const typeIndex = allArtifacts
    .slice(0, index + 1)
    .filter(a => a.type === artifact.type)
    .length

  const showNumber = allArtifacts.length > 1
  const title = showNumber ? `${typeName} ${typeIndex}` : typeName

  return truncateTitle(title)
}

// 截断标题，最多显示6个字符
function truncateTitle(title: string): string {
  if (title.length <= 6) {
    return title
  }
  return title.substring(0, 6) + '...'
}

export default function ArtifactTabs({ className }: ArtifactTabsProps) {
  const { currentSession, switchArtifact } = useArtifacts()
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // 检查是否可以滚动
  const checkScroll = () => {
    if (!tabsContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth)
  }

  // 监听滚动事件
  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => checkScroll())
    observer.observe(container)

    return () => observer.disconnect()
  }, [currentSession])

  // 处理滚动
  const handleScroll = (direction: 'left' | 'right') => {
    if (!tabsContainerRef.current) return
    const scrollAmount = 200
    if (direction === 'left') {
      tabsContainerRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' })
    } else {
      tabsContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  // 如果没有会话或 artifacts，不渲染
  if (!currentSession || currentSession.artifacts.length === 0) {
    return null
  }

  const { artifacts, currentIndex } = currentSession
  const showTabs = artifacts.length > 1
  const showScrollButtons = artifacts.length > 5 // 超过5个标签时显示左右按钮

  return (
    <div className={cn(
      'flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded-lg w-full max-w-full',
      !showTabs && 'hidden',  // 只有一个 artifact 时不显示 tabs
      className
    )}>
      {/* 左滚动按钮 */}
      {showScrollButtons && canScrollLeft && (
        <button
          onClick={() => handleScroll('left')}
          className="flex-shrink-0 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          title="向左滚动"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
      )}

      {/* 标签容器，宽度约束 */}
      <div
        ref={tabsContainerRef}
        onScroll={checkScroll}
        className="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0 flex-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {artifacts.map((artifact, index) => {
          const Icon = ARTIFACT_ICONS[artifact.type]
          const isActive = index === currentIndex
          const title = getTabTitle(artifact, index, artifacts)

          // 修复：确保每个artifact有唯一的key，使用artifact.id或fallback到index
          const key = artifact.id || `artifact-${index}`

          return (
            <button
              key={key}
              onClick={() => switchArtifact(index)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                'whitespace-nowrap flex-shrink-0',
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

      {/* 右滚动按钮 */}
      {showScrollButtons && canScrollRight && (
        <button
          onClick={() => handleScroll('right')}
          className="flex-shrink-0 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          title="向右滚动"
        >
          <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
      )}
    </div>
  )
}
