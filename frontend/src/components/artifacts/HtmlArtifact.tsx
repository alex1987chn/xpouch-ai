import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface HtmlArtifactProps {
  content: string
  className?: string
}

export default function HtmlArtifact({ content, className }: HtmlArtifactProps) {
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null)

  // 创建 Blob URL 用于渲染 HTML
  useEffect(() => {
    if (content) {
      const blob = new Blob([content], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      setHtmlUrl(url)

      // 清理函数
      return () => {
        URL.revokeObjectURL(url)
      }
    }
  }, [content])

  return (
    <div className={cn('w-full h-full flex flex-col overflow-hidden bg-white dark:bg-slate-900', className)}>
      {/* Browser Chrome Header - Full Width, No Gap */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700/50">
        {/* Window Control Dots - Project Theme Colors */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-600 dark:bg-slate-400 hover:bg-slate-500 dark:hover:bg-slate-500 transition-colors cursor-pointer" />
          <div className="w-3 h-3 rounded-full bg-slate-600 dark:bg-slate-400 hover:bg-slate-500 dark:hover:bg-slate-500 transition-colors cursor-pointer" />
          <div className="w-3 h-3 rounded-full bg-blue-500 hover:bg-blue-400 transition-colors cursor-pointer" />
        </div>
        {/* URL Bar Placeholder */}
        <div className="flex-1 mx-4 px-3 py-1.5 bg-gray-800 rounded text-xs text-gray-400">
          {content.slice(0, 60)}
        </div>
      </div>

      {/* Iframe Content - Full Coverage, No Gap */}
      <div className="flex-1 overflow-hidden min-h-0">
        {htmlUrl ? (
          <iframe
            src={htmlUrl}
            className="w-full h-full bg-white border-0"
            sandbox="allow-same-origin allow-forms allow-popups"
            title="HTML Preview"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            加载中...
          </div>
        )}
      </div>
    </div>
  )
}

