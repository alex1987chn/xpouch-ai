import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface HtmlArtifactProps {
  content: string
  className?: string
}

export default function HtmlArtifact({ content, className }: HtmlArtifactProps) {
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null)

  // 提取 HTML 内容（去除代码块标记）
  const extractHtmlContent = (content: string): string => {
    // 匹配 ```html ... ``` 格式
    const codeBlockMatch = content.match(/```html\n?([\s\S]*?)```/i)
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim()
    }
    // 如果没有代码块标记，返回原始内容
    return content.trim()
  }

  // 创建 Blob URL 用于渲染 HTML
  useEffect(() => {
    if (content) {
      const htmlContent = extractHtmlContent(content)
      const blob = new Blob([htmlContent], { type: 'text/html' })
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
        <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-slate-400">
          加载中...
        </div>
      )}
    </div>
  )
}

