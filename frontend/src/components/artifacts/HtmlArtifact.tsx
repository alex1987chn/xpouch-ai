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
    <div className={cn('w-full h-full', className)}>
      {htmlUrl ? (
        <iframe
          src={htmlUrl}
          className="w-full h-full bg-white"
          sandbox="allow-same-origin allow-forms allow-popups"
          title="HTML Preview"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          加载中...
        </div>
      )}
    </div>
  )
}

