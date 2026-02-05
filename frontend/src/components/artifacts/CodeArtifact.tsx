import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'
import { Copy, Check } from 'lucide-react'

interface CodeArtifactProps {
  content: string
  language?: string
  className?: string
}

export default function CodeArtifact({ content, language = 'text', className }: CodeArtifactProps) {
  const [copied, setCopied] = useState(false)

  // 提取代码内容（去除代码块标记）
  const extractCodeContent = (content: string): string => {
    // 匹配 ```<lang> ... ``` 格式
    const codeBlockMatch = content.match(/```\w*\n?([\s\S]*?)```/i)
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim()
    }
    // 如果没有代码块标记，返回原始内容
    return content.trim()
  }

  // 复制功能
  const handleCopy = () => {
    const code = extractCodeContent(content)
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const code = extractCodeContent(content)
  const displayLanguage = language || 'text'

  return (
    <div className={cn('w-full h-full overflow-auto flex flex-col', className)}>
      {/* 顶部栏：语言标识 + 复制按钮 */}
      <div className="flex justify-between items-center bg-[#1e1e1e] dark:bg-[#1e1e1e] px-4 py-2 text-xs text-gray-400 dark:text-gray-400 border-b border-gray-700 dark:border-gray-700 shrink-0">
        <span className="font-mono uppercase tracking-wide">{displayLanguage}</span>
        <button
          onClick={handleCopy}
          className="hover:text-white dark:hover:text-white transition-colors flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-800 dark:hover:bg-gray-700"
        >
          {copied ? (
            <>
              <Check size={14} className="text-green-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* 语法高亮区域 */}
      <div className="flex-1 overflow-auto">
        <SyntaxHighlighter
          language={displayLanguage}
          style={vscDarkPlus}
          customStyle={{ margin: 0, padding: '1rem', fontSize: '0.875rem', backgroundColor: 'transparent' }}
          showLineNumbers={true}
          wrapLongLines={true}
          lineNumberStyle={{
            color: '#8b949e',
            backgroundColor: 'transparent',
            marginRight: '1rem',
            paddingLeft: '0.5rem',
            paddingRight: '1rem',
            minWidth: '2.5rem',
            textAlign: 'right',
            userSelect: 'none'
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

