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
import { cn } from '@/lib/utils'
// 🔥 注意：prism-react-renderer 内置了 Prism，不需要再导入 prismjs

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
  showLineNumbers?: boolean
  isDarkTheme?: boolean
  /** 是否启用横向滚动（默认 false，长内容时启用） */
  enableHorizontalScroll?: boolean
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
  isDarkTheme = true,
  enableHorizontalScroll = false,
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
            enableHorizontalScroll && 'whitespace-pre overflow-x-auto',
            !enableHorizontalScroll && 'whitespace-pre-wrap break-all',
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
                enableHorizontalScroll ? 'table-row' : 'block',
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
        'bg-surface-elevated',
        'text-content-primary',
        className
      )}
    >
      {children}
    </code>
  )
}
