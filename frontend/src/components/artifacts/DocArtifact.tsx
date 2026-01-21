import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface DocArtifactProps {
  content: string
  className?: string
}

export default function DocArtifact({ content, className }: DocArtifactProps) {
  return (
    <div className={cn('prose prose-slate dark:prose-invert prose-sm max-w-none p-6 w-full h-full overflow-auto', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 border-b border-slate-300 dark:border-slate-700 pb-2 mb-4 mt-6">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 border-b border-slate-300 dark:border-slate-700 pb-2 mb-3 mt-5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-4 mb-2">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
              {children}
            </p>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300 space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 mb-4 text-slate-700 dark:text-slate-300 space-y-1">
              {children}
            </ol>
          ),
          code: ({ children, className }) => {
            const isInline = !className?.includes('language-')
            return isInline ? (
              <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm text-slate-800 dark:text-slate-200">
                {children}
              </code>
            ) : (
              <code className="block text-slate-800 dark:text-slate-200">{children}</code>
            )
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-slate-400 dark:border-slate-600 pl-4 italic text-slate-600 dark:text-slate-400 my-4">
              {children}
            </blockquote>
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt || 'Image'}
              className="rounded-lg shadow-md max-w-full h-auto my-4"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
              }}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

