import { useState, useEffect } from 'react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'

interface HtmlArtifactProps {
  content: string
  className?: string
}

export default function HtmlArtifact({ content, className }: HtmlArtifactProps) {
  const { t } = useTranslation()
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
      // 注入柔和滚动条样式到 iframe 内部（iframe 内取不到主题变量，用中性色）
      const softScrollbarStyle = `
        <style>
          * {
            scrollbar-width: thin;
            scrollbar-color: rgba(45,42,38,.25) transparent;
          }
          *::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          *::-webkit-scrollbar-track {
            background: transparent;
          }
          *::-webkit-scrollbar-thumb {
            background: rgba(45,42,38,.22);
            border-radius: 999px;
          }
          *::-webkit-scrollbar-thumb:hover {
            background: rgba(45,42,38,.4);
          }
        </style>
      `
      // 检查是否有 head 标签
      const hasHead = /<head/i.test(htmlContent)
      let styledContent: string
      if (hasHead) {
        styledContent = htmlContent.replace(/<head>/i, '<head>' + softScrollbarStyle)
      } else {
        // 如果没有 head，在 body 或 html 标签后插入
        const bodyMatch = htmlContent.match(/<body([^>]*)>/i)
        if (bodyMatch) {
          styledContent = htmlContent.replace(
            /<body([^>]*)>/i,
            '<body$1>' + softScrollbarStyle
          )
        } else {
          // 没有 body 标签，直接在最前面插入
          styledContent = softScrollbarStyle + htmlContent
        }
      }

      const blob = new Blob([styledContent], { type: 'text/html' })
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
          className="w-full h-full bg-white border-none"
          // 安全边界：blob URL 继承主站 origin，一旦给 allow-same-origin，
          // AI 生成的脚本就能带着主站 Cookie 调 API / 读 localStorage（沙箱逃逸）。
          // 只给 scripts/forms/modals/popups——与分享页 iframe 同一隔离口径。
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          title="HTML Preview"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-content-muted">
          {t('loading')}
        </div>
      )}
    </div>
  )
}

