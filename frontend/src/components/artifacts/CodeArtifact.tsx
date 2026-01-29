import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface CodeArtifactProps {
  content: string
  language?: string
  className?: string
}

export default function CodeArtifact({ content, language = 'text', className }: CodeArtifactProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 简单的代码高亮渲染（不使用 Monaco Editor，保持轻量）
  useEffect(() => {
    if (!containerRef.current || !content) return

    const code = content.trim()
    const lines = code.split('\n')

  // 基础语法高亮（关键词）
  const highlightKeywords = (text: string, keywords: string[]) => {
    return keywords.reduce((acc, keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g')
      return acc.replace(regex, `<span class="text-purple-600 dark:text-purple-400 font-semibold">${keyword}</span>`)
    }, text)
  }

  const keywordsByLanguage: Record<string, string[]> = {
    python: ['def', 'class', 'import', 'from', 'return', 'if', 'else', 'for', 'while', 'try', 'except', 'with', 'as'],
    javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'import', 'export'],
    java: ['public', 'private', 'class', 'void', 'int', 'String', 'return', 'if', 'else', 'for', 'while'],
    typescript: ['interface', 'type', 'const', 'let', 'function', 'return', 'interface', 'export'],
    rust: ['fn', 'let', 'mut', 'struct', 'impl', 'pub', 'use', 'return'],
  }

  const keywords = keywordsByLanguage[language.toLowerCase()] || []
  const highlightedLines = lines.map(line =>
    keywords.length > 0 ? highlightKeywords(escapeHtml(line), keywords) : escapeHtml(line)
  )

  containerRef.current.innerHTML = highlightedLines
    .map((line, idx) => `<div class="flex"><span class="w-10 text-right text-gray-400 dark:text-gray-600 select-none mr-4 text-xs">${idx + 1}</span><pre class="flex-1 text-sm text-slate-800 dark:text-slate-200 font-mono whitespace-pre-wrap break-words">${line}</pre></div>`)
    .join('')
  }, [content, language])

  const escapeHtml = (text: string) => {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  return (
    <div className={cn('w-full h-full overflow-auto', className)}>
      <div
        ref={containerRef}
        className="w-full h-full font-mono text-sm"
      />
    </div>
  )
}

