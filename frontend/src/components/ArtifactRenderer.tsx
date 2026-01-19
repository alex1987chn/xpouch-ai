import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, ExternalLink, Globe, Code, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ArtifactRendererProps {
  type: string
  content: any
}

export default function ArtifactRenderer({ type, content }: ArtifactRendererProps) {
  const [copied, setCopied] = useState(false)
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null)

  // 复制到剪贴板
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // 清理Blob URL
  useEffect(() => {
    return () => {
      if (htmlUrl) {
        URL.revokeObjectURL(htmlUrl)
      }
    }
  }, [htmlUrl])

  // 创建 HTML Blob URL
  useEffect(() => {
    if (type === 'html' && typeof content === 'string' && content) {
      const blob = new Blob([content], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      setHtmlUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    }
  }, [type, content])

  // Type: code - Syntax-Highlighted Code Block
  if (type === 'code') {
    const { language, code } = content || { language: 'text', code: '' }

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 30, damping: 20 }}
        className="rounded-xl bg-gray-800/60 p-4"
      >
        <div className="relative rounded-lg overflow-hidden">
          {/* Language Label */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 border-b border-gray-700/50">
            <span className="text-xs font-medium text-gray-400 uppercase">{language || 'text'}</span>
            <button
              onClick={() => handleCopy(code)}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="复制代码"
            >
              {copied ? <Code className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          
          {/* Code Content */}
          <div className="p-4 overflow-x-auto">
            <SyntaxHighlighter
              language={language || 'text'}
              style={vscDarkPlus}
              PreTag="div"
              customStyle={{ background: 'transparent', padding: 0, margin: 0 }}
              className="text-sm"
            >
              {String(code)}
            </SyntaxHighlighter>
          </div>
        </div>
      </motion.div>
    )
  }

  // Type: search - Dual-Column Information Cards
  if (type === 'search') {
    const results = content?.results || []

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 30, damping: 20 }}
        className="rounded-xl p-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          {results.map((result: any, index: number) => (
            <div
              key={index}
              className={cn(
                'rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors cursor-pointer'
              )}
            >
              {/* Favicon & Title */}
              <div className="flex items-start gap-3 mb-2">
                {result.favicon && (
                  <img src={result.favicon} alt="" className="w-5 h-5 rounded flex-shrink-0" />
                )}
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-gray-800 dark:text-gray-100 hover:text-blue-400 hover:underline transition-colors"
                >
                  {result.title}
                </a>
              </div>
              
              {/* Snippet */}
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
                {result.snippet}
              </p>
              
              {/* Source URL */}
              {result.url && (
                <div className="flex items-center gap-1 mt-2">
                  <Globe className="w-3 h-3 text-gray-500" />
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-blue-400 hover:underline transition-colors truncate"
                  >
                    {result.url}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    )
  }

  // Type: report - Rich Markdown Document
  if (type === 'report' || type === 'markdown') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 30, damping: 20 }}
        className="rounded-xl p-6"
      >
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Custom heading styles
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-violet-400 border-b border-violet-400/30 pb-2 mb-4 mt-6">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-violet-400 border-b border-violet-400/30 pb-2 mb-3 mt-5">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-semibold text-violet-400 border-b border-violet-400/30 pb-2 mb-2 mt-4">
                  {children}
                </h3>
              ),
              // Custom link styles
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline transition-colors"
                >
                  {children}
                </a>
              ),
              // Custom code styles
              code: ({ children, className }) => {
                const isInline = !className?.includes('language-')
                return isInline ? (
                  <code className="bg-gray-700 px-1.5 py-0.5 rounded text-sm">
                    {children}
                  </code>
                ) : (
                  <code className={cn('block', className)}>{children}</code>
                )
              },
              // Custom list styles
              ul: ({ children }) => (
                <ul className="space-y-2 list-disc pl-4 marker:text-violet-400">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="space-y-2 list-decimal pl-4 marker:text-violet-400">
                  {children}
                </ol>
              ),
            }}
          >
            {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
          </ReactMarkdown>
        </div>
      </motion.div>
    )
  }

  // Type: html - Embedded Web Content
  if (type === 'html') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 30, damping: 20 }}
        className="rounded-xl overflow-hidden"
      >
        {/* Browser Window Wrapper */}
        <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 overflow-hidden">
          {/* Browser Chrome */}
          <div className="flex items-center justify-between px-6 py-4 bg-gray-900/90 border-b border-gray-700/50">
            {/* URL Bar Placeholder */}
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded text-xs text-gray-400">
              <Globe className="w-3 h-3" />
              <span className="flex-1 truncate">
                {typeof content === 'string' ? content.slice(0, 50) : 'Web Content'}
              </span>
            </div>
          </div>

          {/* Iframe Content */}
          {htmlUrl ? (
            <iframe
              src={htmlUrl}
              className="w-full h-[500px] bg-white"
              sandbox="allow-scripts allow-same-origin"
              title="Artifact Content"
            />
          ) : (
            <div className="w-full h-[500px] flex items-center justify-center text-gray-500">
              加载中...
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  // Fallback - Unknown Type
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 30, damping: 20 }}
      className="rounded-xl bg-gray-800/60 p-6"
    >
      <div className="flex items-center justify-center gap-3 text-gray-400">
        <FileText className="w-8 h-8" />
        <p className="text-sm">Unsupported artifact type: {type}</p>
      </div>
    </motion.div>
  )
}
