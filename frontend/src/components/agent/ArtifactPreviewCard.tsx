import { memo } from 'react'
import { Code, Globe, FileText, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DetectedArtifact = {
  type: 'code' | 'html' | 'markdown'
  content: string
  language?: string
}

// 生成artifact名称 - 按类型分别计数
export function getArtifactName(type: string, index: number, allArtifacts: DetectedArtifact[]): string {
  const typeMap: Record<string, string> = {
    'code': '代码',
    'html': '网页',
    'markdown': '文本'
  }

  // 计算该类型在所有artifacts中的索引
  const typeIndex = allArtifacts
    .slice(0, index + 1)
    .filter(a => a.type === type)
    .length

  return `${typeMap[type] || type}${typeIndex}`
}

// 获取预览内容（截取）
export function getPreviewContent(content: string, maxLength = 80): string {
  // 移除代码块标记，只保留内容
  const cleanContent = content.replace(/```(\w+)?\n?/g, '').replace(/\n```$/g, '')
  if (cleanContent.length <= maxLength) {
    return cleanContent
  }
  return cleanContent.substring(0, maxLength) + '...'
}

interface ArtifactPreviewCardProps {
  artifact: DetectedArtifact
  index: number
  allArtifacts: DetectedArtifact[]
  onClick: (artifact: DetectedArtifact, index: number, allArtifacts: DetectedArtifact[]) => void
}

const typeConfig = {
  code: {
    icon: <Code className="w-4 h-4" />,
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800/30'
  },
  html: {
    icon: <Globe className="w-4 h-4" />,
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-600 dark:text-orange-400',
    borderColor: 'border-orange-200 dark:border-orange-800/30'
  },
  markdown: {
    icon: <FileText className="w-4 h-4" />,
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    textColor: 'text-purple-600 dark:text-purple-400',
    borderColor: 'border-purple-200 dark:border-purple-800/30'
  }
} as const

function ArtifactPreviewCardComponent({ artifact, index, allArtifacts, onClick }: ArtifactPreviewCardProps) {
  const typeName = getArtifactName(artifact.type, index, allArtifacts)
  const previewContent = getPreviewContent(artifact.content)
  const config = typeConfig[artifact.type]

  return (
    <button
      onClick={() => onClick(artifact, index, allArtifacts)}
      className={cn(
        'w-full group relative rounded-lg border p-3 text-left transition-all',
        'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
        config.bgColor,
        config.borderColor
      )}
    >
      <div className="flex items-start gap-3">
        {/* 图标 */}
        <div className={cn(
          'flex-shrink-0 mt-0.5 p-1.5 rounded-md',
          config.textColor
        )}>
          {config.icon}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          {/* 名称 */}
          <div className={cn(
            'text-xs font-medium mb-1',
            config.textColor
          )}>
            {typeName}
          </div>

          {/* 预览内容 */}
          <div className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
            {previewContent}
          </div>
        </div>

        {/* 右侧指示箭头 */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight className="w-4 h-4 text-gray-400" />
        </div>
      </div>
    </button>
  )
}

const ArtifactPreviewCard = memo(ArtifactPreviewCardComponent)
export default ArtifactPreviewCard