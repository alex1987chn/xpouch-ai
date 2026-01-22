import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.css'
import { cn } from '@/lib/utils'

interface DocArtifactProps {
  content: string
  className?: string
}

export default function DocArtifact({ content, className }: DocArtifactProps) {
  return (
    <div className={cn('prose prose-slate dark:prose-invert prose-sm max-w-none p-6 w-full h-full overflow-auto min-h-0', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeKatex]}
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
          h4: ({ children }) => (
            <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-3 mb-2">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-2 mb-1">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-2 mb-1">
              {children}
            </h6>
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
              <code className="text-slate-800 dark:text-slate-200">{children}</code>
            )
          },
          pre: ({ children }) => (
            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto my-4">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-slate-400 dark:border-slate-600 pl-4 italic text-slate-600 dark:text-slate-400 my-4">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-slate-900 dark:text-slate-100">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-800 dark:text-slate-200">
              {children}
            </em>
          ),
          del: ({ children }) => (
            <del className="line-through text-slate-500 dark:text-slate-400">
              {children}
            </del>
          ),
          hr: () => (
            <hr className="my-6 border-t border-slate-300 dark:border-slate-700" />
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-slate-300 dark:border-slate-700">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-100 dark:bg-slate-800">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-300 dark:divide-slate-700">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left font-semibold text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
              {children}
            </td>
          ),
          input: ({ type, checked }) => (
            <input
              type={type}
              checked={checked}
              disabled={true}
              className="w-4 h-4 mr-2 cursor-not-allowed"
            />
          ),
          sup: ({ children }) => (
            <sup className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer">
              {children}
            </sup>
          ),
          math: ({ children }) => (
            <span className="inline-block px-1 py-0.5 font-mono">
              {children}
            </span>
          ),
          inlineMath: ({ children }) => (
            <span className="inline font-mono">
              {children}
            </span>
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
          video: ({ src, controls = true, autoPlay = false, loop = false }) => (
            <video
              src={src}
              controls={controls}
              autoPlay={autoPlay}
              loop={loop}
              className="rounded-lg shadow-md max-w-full h-auto my-4"
              onError={(e) => {
                const target = e.target as HTMLVideoElement
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

