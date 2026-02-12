/**
 * CodeBlock - 基于 prism-react-renderer 的代码高亮组件
 * 
 * 替代 react-syntax-highlighter，优势：
 * - 更小的体积（~20KB vs ~500KB）
 * - React 19 完全兼容
 * - 更好的 TypeScript 支持
 * - Server Components 兼容
 */

import { Highlight, themes } from 'prism-react-renderer'
import Prism from 'prismjs'
import { cn } from '@/lib/utils'

// 导入常用语言支持
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-docker'

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
  showLineNumbers?: boolean
  isDarkTheme?: boolean
}

// 语言映射（标准化语言名称）
const languageMap: Record<string, string> = {
  'ts': 'typescript',
  'js': 'javascript',
  'tsx': 'tsx',
  'jsx': 'jsx',
  'py': 'python',
  'yml': 'yaml',
  'sh': 'bash',
  'shell': 'bash',
  'md': 'markdown',
  'json-chart': 'json',  // 映射 chart json 到 json
}

export function CodeBlock({
  code,
  language = 'text',
  className,
  showLineNumbers = true,
  isDarkTheme = true
}: CodeBlockProps) {
  const normalizedLanguage = languageMap[language.toLowerCase()] || language.toLowerCase()
  const theme = isDarkTheme ? themes.vsDark : themes.github

  return (
    <Highlight
      theme={theme}
      code={code.trim()}
      language={normalizedLanguage as any}
    >
      {({ className: highlightClassName, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={cn(
            highlightClassName,
            'text-[0.875rem] leading-relaxed',
            className
          )}
          style={{
            ...style,
            margin: 0,
            padding: '1rem',
            backgroundColor: 'transparent',
            minHeight: '100%',
          }}
        >
          {tokens.map((line, i) => (
            <div
              key={i}
              {...getLineProps({ line })}
              className={cn(
                'table-row',
                showLineNumbers && 'before:content-[attr(data-line-number)] before:table-cell before:text-right before:pr-4 before:select-none'
              )}
              data-line-number={showLineNumbers ? i + 1 : undefined}
              style={showLineNumbers ? {
                '--line-number-color': isDarkTheme ? '#8b949e' : '#6e7781',
              } as React.CSSProperties : undefined}
            >
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}

// 内联代码组件（用于行内代码）
interface InlineCodeProps {
  children: React.ReactNode
  className?: string
}

export function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code
      className={cn(
        'px-1.5 py-0.5 rounded text-sm font-mono',
        'bg-gray-100 dark:bg-gray-800',
        'text-gray-800 dark:text-gray-200',
        className
      )}
    >
      {children}
    </code>
  )
}
