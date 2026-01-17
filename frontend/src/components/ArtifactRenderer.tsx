import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Code, FileText, GitBranch, ExternalLink, Copy, Check } from 'lucide-react'
import DOMPurify from 'dompurify'

interface ArtifactRendererProps {
  type: 'code' | 'mermaid' | 'markdown'
  content: string
  className?: string
}

export default function ArtifactRenderer({
  type,
  content,
  className
}: ArtifactRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [mermaidKey, setMermaidKey] = useState(0)

  // Handle mermaid rendering
  useEffect(() => {
    if (type === 'mermaid' && containerRef.current) {
      const renderMermaid = async () => {
        try {
          const mermaid = await import('mermaid')
          mermaid.default.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
            fontFamily: 'inherit'
          })

          // Clear previous content
          containerRef.current!.innerHTML = ''

          // Create container for mermaid
          const mermaidDiv = document.createElement('div')
          mermaidDiv.className = 'mermaid-container flex justify-center p-4'
          containerRef.current!.appendChild(mermaidDiv)

          // Generate unique ID
          const id = `mermaid-${Date.now()}`
          mermaidDiv.id = id

          // Render
          await mermaid.default.run({
            nodes: [mermaidDiv]
          })
        } catch (error) {
          console.error('Mermaid rendering error:', error)
          if (containerRef.current) {
            containerRef.current.innerHTML = `
              <div class="flex items-center justify-center p-8 text-red-500">
                <p>图表渲染失败，请检查语法</p>
              </div>
            `
          }
        }
      }

      renderMermaid()
      // Re-render when content changes
      setMermaidKey(prev => prev + 1)
    }
  }, [type, content])

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
    }
  }

  // Render based on type
  const renderContent = () => {
    switch (type) {
      case 'code':
        return (
          <div className="relative group">
            {/* Code Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="ml-3 text-xs text-gray-400">Code Preview</span>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            {/* Code Content */}
            <pre className="p-4 overflow-auto bg-gray-900 dark:bg-gray-950 text-gray-100 font-mono text-sm">
              <code>{content}</code>
            </pre>
          </div>
        )

      case 'markdown':
        // Sanitize and render markdown
        const sanitizedContent = DOMPurify.sanitize(content)
        return (
          <div
            className="prose prose-gray dark:prose-invert max-w-none p-6 overflow-auto"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        )

      case 'mermaid':
        return (
          <div
            ref={containerRef}
            key={mermaidKey}
            className="w-full h-full overflow-auto p-4 bg-white dark:bg-gray-900 rounded-lg"
          >
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="animate-pulse text-gray-400">
                Loading diagram...
              </div>
            </div>
          </div>
        )

      default:
        return (
          <div className="flex items-center justify-center p-8 text-gray-500">
            Unknown artifact type: {type}
          </div>
        )
    }
  }

  // Get icon based on type
  const getTypeIcon = () => {
    switch (type) {
      case 'code':
        return <Code className="w-4 h-4" />
      case 'markdown':
        return <FileText className="w-4 h-4" />
      case 'mermaid':
        return <GitBranch className="w-4 h-4" />
      default:
        return null
    }
  }

  // Get type label
  const getTypeLabel = () => {
    switch (type) {
      case 'code':
        return '代码预览'
      case 'markdown':
        return '文档'
      case 'mermaid':
        return '流程图'
      default:
        return '内容'
    }
  }

  return (
    <div
      className={cn(
        'w-full h-full flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2">
          {getTypeIcon()}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {getTypeLabel()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
            title="在新窗口打开"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  )
}
