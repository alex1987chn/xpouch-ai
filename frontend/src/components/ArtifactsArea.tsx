import { useArtifacts } from '@/providers/ArtifactProvider'
import { cn } from '@/lib/utils'
import { CodeArtifact, DocArtifact, SearchArtifact, HtmlArtifact, TextArtifact } from './artifacts'
import ArtifactTabs from './ArtifactTabs'
import { X, Copy, Check, Maximize2 } from 'lucide-react'
import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

// ============================================
// ArtifactsArea - 整合 Tabs + Content 的交付物展示区域
// ============================================

interface ArtifactsAreaProps {
  className?: string
  isFullscreen?: boolean
  onFullscreenToggle?: () => void
}

export default function ArtifactsArea({ className, isFullscreen, onFullscreenToggle }: ArtifactsAreaProps) {
  const { currentArtifact, currentSession, selectExpert } = useArtifacts()
  const [copied, setCopied] = useState(false)

  // 如果没有选中专家或没有 artifact，显示空状态
  if (!currentSession || !currentArtifact) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center h-full text-gray-400',
        'bg-gray-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed',
        'border-gray-200 dark:border-slate-700',
        className
      )}>
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
            <span className="text-3xl">📦</span>
          </div>
          <p className="text-sm font-medium">暂无交付物</p>
          <p className="text-xs">点击专家状态栏中的专家查看交付物</p>
        </div>
      </div>
    )
  }

  // 处理复制
  const handleCopy = async () => {
    if (!currentArtifact.content) return
    try {
      await navigator.clipboard.writeText(currentArtifact.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // 处理关闭（取消选中专家）
  // 只在全屏模式时才提供关闭功能，正常模式不需要关闭
  const handleClose = () => {
    if (onFullscreenToggle) {
      onFullscreenToggle() // 关闭预览模式
    }
  }

  // 获取专家显示名称
  const getExpertDisplayName = (expertType: string): string => {
    const displayNames: Record<string, string> = {
      'assistant': 'AI 助手',
      'commander': '指挥官',
      'search': '搜索专家',
      'coder': '编程专家',
      'researcher': '研究专家',
      'analyzer': '分析专家',
      'writer': '写作专家',
      'planner': '规划专家',
      'image_analyzer': '图像分析专家'
    }
    
    return displayNames[expertType] || expertType
  }

  // 根据 artifact 类型渲染对应组件
  const renderArtifact = () => {
    const { type, content, language } = currentArtifact

    switch (type) {
      case 'code':
        return <CodeArtifact content={content} language={language || 'text'} className="h-full" />
      case 'markdown':
        return <DocArtifact content={content} className="h-full" />
      case 'search':
        return <SearchArtifact results={JSON.parse(content || '[]')} className="h-full" />
      case 'html':
        return <HtmlArtifact content={content} className="h-full" />
      case 'text':
        return <TextArtifact content={content} className="h-full" />
      default:
        return null
    }
  }

  return (
    <div
      id={`artifact-${currentSession.expertType}`}
      className={cn(
        'flex flex-col h-full w-full max-w-full bg-white dark:bg-slate-800 rounded-2xl border',
        'border-gray-200 dark:border-slate-700 overflow-hidden',
        className
      )}>
      {/* 头部：标题 + 操作栏，宽度约束 */}
      <div className="flex items-center justify-between w-full max-w-full px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
        {/* 左侧：标题 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* 专家名称 */}
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">
            {getExpertDisplayName(currentSession.expertType)}
          </span>

          {/* Tab 切换，宽度约束 */}
          <div className="flex-1 min-w-0">
            <ArtifactTabs />
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* 复制按钮 */}
          <button
            onClick={handleCopy}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            title="复制内容"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            )}
          </button>

          {/* 全屏按钮（可选） */}
          {onFullscreenToggle && (
            <button
              onClick={onFullscreenToggle}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              <Maximize2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          )}

          {/* 关闭按钮 - 只在全屏模式显示 */}
          {isFullscreen && (
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* 内容区域，使用h-full填满父级空间 */}
      <ScrollArea className="flex-1 w-full h-full overflow-hidden">
        <div className="w-full h-full max-w-full min-h-0">
          {renderArtifact()}
        </div>
      </ScrollArea>
    </div>
  )
}
