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
  content?: string
  className?: string
}

function parseSearchContent(content: string): SearchResult[] {
  try {
    // 尝试解析为 JSON
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed as SearchResult[]
    }
    // 如果是单个对象
    if (parsed && typeof parsed === 'object') {
      return [parsed as SearchResult]
    }
  } catch {
    // 解析失败，按文本处理
    return [{
      title: '搜索结果',
      description: content,
      verified: false
    }]
  }
  return []
}

export default function SearchArtifact({ results = [], content, className }: SearchArtifactProps) {
  // 如果有 content，尝试解析为搜索结果
  const parsedResults: SearchResult[] = results.length > 0 ? results : (
    content ? parseSearchContent(content) : []
  )

  return (
    <div className={cn('w-full min-h-full overflow-auto', className)}>
      {/* Header - Minimal, no gradient */}
      <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">搜索结果</span>
        </div>
        <span className="text-slate-500 dark:text-slate-400 text-xs">{parsedResults.length} 条结果</span>
      </div>

      {/* Search Results */}
      <div className="p-2 space-y-2">
        {parsedResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-slate-400">
            <Search className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">暂无搜索结果</p>
          </div>
        ) : (
          parsedResults.map((result, idx) => (
            <div
              key={idx}
              className="group p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              {/* Title */}
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-800 dark:text-slate-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {result.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-slate-300 whitespace-pre-wrap">
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
