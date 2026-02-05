import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

interface MermaidRendererProps {
  code: string
}

export function MermaidRenderer({ code }: MermaidRendererProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'dark', 
      securityLevel: 'loose',
      fontFamily: 'inherit'
    })
    
    const render = async () => {
      if (!code) return
      
      try {
        setError(null)
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg: renderedSvg } = await mermaid.render(id, code.trim())
        setSvg(renderedSvg)
      } catch (e) {
        console.error('Mermaid render error:', e)
        setError('流程图渲染失败')
      }
    }
    
    render()
  }, [code])

  if (error) {
    return (
      <div className="text-red-500 text-xs p-4 bg-red-500/10 rounded border border-red-500/20">
        <div className="font-semibold mb-1">⚠️ Mermaid 渲染错误</div>
        <div>{error}</div>
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
