import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { logger } from '@/utils/logger'

interface MermaidRendererProps {
  code: string
}

/**
 * 检测 Mermaid 代码是否可能完整（流式输出防抖）
 * 简单启发式：检查是否有 diagram 结束标记
 */
function isMermaidComplete(code: string): boolean {
  const trimmed = code.trim()
  if (!trimmed) return false
  
  // 检查是否包含基本的 diagram 结构
  const lines = trimmed.split('\n').filter(line => line.trim())
  if (lines.length < 2) return false
  
  // 检查最后一行是否有结束感（不是未完成的语句）
  const lastLine = lines[lines.length - 1].trim()
  
  // 如果最后一行以 --> 或 --- 或 ==> 结尾，可能是未完成的连接
  if (/(-->|---|==>)\s*$/.test(lastLine)) {
    return false
  }
  
  // 如果最后一行以 { 或 [ 或 ( 结尾，可能是未完成的节点
  if (/[\{\[\(]\s*$/.test(lastLine)) {
    return false
  }
  
  // 如果最后一行是不完整的字符串（以 `"` 结尾但没有闭合）
  const quoteCount = (lastLine.match(/"/g) || []).length
  if (quoteCount % 2 !== 0) {
    return false
  }
  
  // 🔥 甘特图特殊处理：检查日期格式是否完整
  if (trimmed.toLowerCase().startsWith('gantt')) {
    // 检查是否有 section 和至少一个任务
    const hasSection = lines.some(l => l.trim().toLowerCase().startsWith('section'))
    const hasTask = lines.some(l => 
      l.includes(':') && 
      !l.toLowerCase().startsWith('gantt') && 
      !l.toLowerCase().startsWith('section') &&
      !l.toLowerCase().startsWith('dateformat')
    )
    // 甘特图需要 section + task
    if (!hasSection || !hasTask) {
      return false
    }
    // 检查任务行是否包含完整的日期（以 d 结尾表示天数，或包含日期格式）
    const taskLines = lines.filter(l => 
      l.includes(':') && 
      !l.toLowerCase().startsWith('gantt') && 
      !l.toLowerCase().startsWith('section') &&
      !l.toLowerCase().startsWith('dateformat')
    )
    // 至少一个任务要有完整的日期定义（以数字+d 或具体日期结尾）
    const hasValidDate = taskLines.some(l => 
      /\d+d\s*$/.test(l) ||           // 以 30d 结尾
      /\d{4}-\d{2}-\d{2}/.test(l) || // 包含 YYYY-MM-DD
      /after\s+\w+/.test(l)          // 包含 after xxx
    )
    if (!hasValidDate) {
      return false
    }
  }
  
  return true
}

export function MermaidRenderer({ code }: MermaidRendererProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'dark', 
      securityLevel: 'loose',
      fontFamily: 'inherit'
    })
  }, [])
  
  useEffect(() => {
    // 🔥 防抖：如果代码不完整，不尝试渲染
    if (!isMermaidComplete(code)) {
      setIsReady(false)
      return
    }
    
    const render = async () => {
      if (!code) return
      
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg: renderedSvg } = await mermaid.render(id, code.trim())
        setSvg(renderedSvg)
        setIsReady(true)
      } catch (e) {
        // 渲染失败但不显示错误，继续显示加载状态
        // 可能是语法还没写完，等待下次更新
        logger.debug('Mermaid render pending:', e)
        setIsReady(false)
      }
    }
    
    render()
  }, [code])

  // 🔥 流式输出中或渲染失败时显示加载状态
  if (!isReady) {
    return (
      <div className="w-full h-[200px] bg-[#1e1e1e] rounded-lg my-4 border border-gray-700 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-status-online rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-status-online rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-status-online rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm">流程图生成中...</span>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={ref}
      className="w-full overflow-x-auto p-4 bg-[#1e1e1e] rounded my-4 flex justify-center border border-gray-700"
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  )
}
