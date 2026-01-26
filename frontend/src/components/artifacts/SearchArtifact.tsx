import { cn } from '@/lib/utils'
import { Search, CheckCircle2, ExternalLink } from 'lucide-react'

interface SearchResult {
  title: string
  description: string
  url?: string
  verified?: boolean
}

interface SearchArtifactProps {
  results?: SearchResult[]
  className?: string
}

export default function SearchArtifact({ results = [], className }: SearchArtifactProps) {
  return (
    <div className={cn('w-full h-full', className)}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-medium">搜索结果</span>
        </div>
        <span className="text-white/80 text-xs">{results.length} 条结果</span>
      </div>

      {/* Search Results */}
      <div className="p-4 space-y-3">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <Search className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">暂无搜索结果</p>
          </div>
        ) : (
          results.map((result, idx) => (
            <div
              key={idx}
              className="group p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-all"
            >
              {/* Title */}
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {result.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {result.description}
                  </p>
                </div>
                {result.verified && (
                  <div className="flex-shrink-0" title="已验证">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  </div>
                )}
              </div>

              {/* URL */}
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  访问源链接
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
