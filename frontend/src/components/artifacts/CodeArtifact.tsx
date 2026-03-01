import { useState } from 'react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { CodeBlock } from '@/components/ui/code-block'
import { MermaidRenderer } from './renderers/MermaidRenderer'
import { ChartRenderer } from './renderers/ChartRenderer'

interface CodeArtifactProps {
  content: string
  language?: string
  className?: string
  showHeader?: boolean  // 是否显示内部 header（默认 false，由外层控制）
  isDarkTheme?: boolean // 主题模式
}

/**
 * CodeArtifact - 智能代码渲染中枢（无头模式）
 * 
 * 职责：纯粹的内容渲染，不管理 header/toolbar
 * - 普通代码（python/js/ts等）→ PrismJS 语法高亮
 * - mermaid → MermaidRenderer 流程图
 * - json-chart → ChartRenderer 图表
 * 
 * Header 由外层 OrchestratorPanelV2 统一管理
 */
export default function CodeArtifact({ 
  content, 
  language = 'text', 
  className,
  showHeader = false,
  isDarkTheme = true
}: CodeArtifactProps) {
  const { t } = useTranslation()
  // 默认看预览（对于可视化内容），但允许切换回源码
  const [showSource, setShowSource] = useState(false)

  const displayLanguage = language.toLowerCase() || 'text'
  
  // 判断是否为可视化内容（支持预览/源码切换）
  const isVisual = ['mermaid', 'json-chart'].includes(displayLanguage)

  // 核心分流逻辑：根据语言渲染不同内容
  const renderVisual = () => {
    switch (displayLanguage) {
      case 'mermaid':
        return <MermaidRenderer code={content} />
      case 'json-chart':
        return <ChartRenderer code={content} />
      default:
        return null
    }
  }

  // 语法高亮用的语言映射
  const highlightLanguage = displayLanguage === 'json-chart' ? 'json' : displayLanguage

  return (
    <div className={cn(
      'relative group rounded-lg overflow-hidden h-full flex flex-col',
      isDarkTheme ? 'bg-[#1e1e1e]' : 'bg-white',
      className
    )}>
      {/* 可选的内部 header（用于 DocArtifact 内嵌场景） */}
      {showHeader && isVisual && (
        <div className={cn(
          "flex justify-between items-center px-3 py-1.5 text-xs border-b shrink-0",
          isDarkTheme 
            ? "bg-[#2d2d2d] text-gray-400 border-gray-700" 
            : "bg-gray-100 text-gray-600 border-gray-200"
        )}>
          <span className="font-mono uppercase font-bold text-blue-400">
            {displayLanguage}
          </span>
          <button
            onClick={() => setShowSource(!showSource)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-xs",
              isDarkTheme 
                ? "bg-gray-700 hover:bg-gray-600 text-gray-300" 
                : "bg-gray-200 hover:bg-gray-300 text-gray-700"
            )}
          >
            {showSource ? t('preview') : t('source')}
          </button>
        </div>
      )}

      {/* 内容区域 - 铺满剩余空间 */}
      <div className="flex-1 w-full min-h-0 overflow-auto bauhaus-scrollbar">
        {isVisual && !showSource ? (
          // 可视化模式：渲染图表/流程图
          renderVisual()
        ) : (
          // 源码模式：语法高亮
          <CodeBlock
            code={content}
            language={highlightLanguage}
            showLineNumbers={true}
            isDarkTheme={isDarkTheme}
            className="h-full"
          />
        )}
      </div>
    </div>
  )
}
