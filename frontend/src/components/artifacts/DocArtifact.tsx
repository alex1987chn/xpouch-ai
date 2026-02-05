import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.css'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'
import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts'

// ----------------------------------------------------------------------
// 图表数据类型和解析逻辑
// ----------------------------------------------------------------------
interface ChartData {
  name: string
  value: number
  [key: string]: any
}

interface ChartConfig {
  type: 'bar' | 'line' | 'pie'
  title?: string
  items: ChartData[]
  xKey?: string
  yKey?: string
  color?: string
  colors?: string[]
}

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

/**
 * 解析并验证图表 JSON 数据
 */
function parseChartData(code: string): ChartConfig | null {
  try {
    const data = JSON.parse(code.trim())

    // 验证必需字段
    if (!data.items || !Array.isArray(data.items)) {
      console.error('[ChartArtifact] 缺少 items 字段或不是数组')
      return null
    }

    // 验证每个数据项
    if (data.items.length === 0 || !data.items[0].name || !data.items[0].value) {
      console.error('[ChartArtifact] 数据项缺少 name 或 value 字段')
      return null
    }

    return data
  } catch (error) {
    console.error('[ChartArtifact] JSON 解析失败:', error)
    return null
  }
}

/**
 * 渲染柱状图
 */
function BarChartRenderer({ config }: { config: ChartConfig }) {
  const xKey = config.xKey || 'name'
  const yKey = config.yKey || 'value'
  const color = config.color || '#3b82f6'

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg my-4 h-[400px]">
      {config.title && (
        <h4 className="text-center font-bold mb-4 text-slate-900 dark:text-slate-100">
          {config.title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={config.items}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.5} />
          <XAxis
            dataKey={xKey}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f1f5f9'
            }}
            itemStyle={{ color: '#f1f5f9' }}
          />
          <Bar
            dataKey={yKey}
            fill={color}
            radius={[4, 4, 0, 0]}
            animationDuration={500}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * 渲染折线图
 */
function LineChartRenderer({ config }: { config: ChartConfig }) {
  const xKey = config.xKey || 'name'
  const yKey = config.yKey || 'value'
  const color = config.color || '#3b82f6'

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg my-4 h-[400px]">
      {config.title && (
        <h4 className="text-center font-bold mb-4 text-slate-900 dark:text-slate-100">
          {config.title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={config.items}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={0.5} />
          <XAxis
            dataKey={xKey}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f1f5f9'
            }}
            itemStyle={{ color: '#f1f5f9' }}
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, r: 4 }}
            activeDot={{ r: 6 }}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * 渲染饼图
 */
function PieChartRenderer({ config }: { config: ChartConfig }) {
  const colors = config.colors || DEFAULT_COLORS

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg my-4 h-[400px]">
      {config.title && (
        <h4 className="text-center font-bold mb-4 text-slate-900 dark:text-slate-100">
          {config.title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={config.items}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={120}
            paddingAngle={5}
            animationDuration={500}
          >
            {config.items.map((item, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f1f5f9'
            }}
            itemStyle={{ color: '#f1f5f9' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * 图表渲染器组件
 */
function ChartRenderer({ code }: { code: string }) {
  const config = parseChartData(code)

  if (!config) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg my-4">
        <div className="flex items-start gap-2">
          <div className="text-red-500 dark:text-red-400 text-xl">⚠️</div>
          <div>
            <h4 className="font-semibold text-red-900 dark:text-red-100 mb-1">
              图表数据格式错误
            </h4>
            <p className="text-sm text-red-700 dark:text-red-300 mb-2">
              无法解析图表 JSON 数据。请确保数据格式正确。
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer text-red-600 dark:text-red-400 hover:underline">
                查看正确格式示例
              </summary>
              <pre className="mt-2 p-3 bg-red-100 dark:bg-red-900/30 rounded text-xs overflow-x-auto">
{`{
  "type": "bar",
  "title": "2024年电动车销量 Top 5",
  "items": [
    { "name": "Tesla Model Y", "value": 1200000 },
    { "name": "BYD Song", "value": 600000 }
  ]
}`}
              </pre>
            </details>
          </div>
        </div>
      </div>
    )
  }

  // 根据类型渲染不同图表
  switch (config.type) {
    case 'line':
      return <LineChartRenderer config={config} />
    case 'pie':
      return <PieChartRenderer config={config} />
    case 'bar':
    default:
      return <BarChartRenderer config={config} />
  }
}

// ----------------------------------------------------------------------
// Mermaid 代码块组件
// ----------------------------------------------------------------------
function MermaidCode({ children }: { children?: React.ReactNode }) {
  const codeRef = useRef<HTMLDivElement>(null)
  const isMounted = useRef(true)
  const content = React.Children.toArray(children)
    .map(child => React.isValidElement(child) ? (child as React.ReactElement).props.children : child)
    .join('')

  useEffect(() => {
    isMounted.current = true

    const renderMermaid = async () => {
      // 检查组件是否仍然挂载
      if (!isMounted.current || !codeRef.current || !content) return

      try {
        const mermaid = await import('mermaid')
        await mermaid.default.initialize({ startOnLoad: false, theme: 'default' })
        const { svg } = await mermaid.default.render(`mermaid-${Date.now()}`, content)

        // 再次检查组件是否仍然挂载
        if (isMounted.current && codeRef.current) {
          codeRef.current.innerHTML = svg
        }
      } catch (error) {
        console.error('Mermaid render error:', error)
        if (isMounted.current && codeRef.current) {
          codeRef.current.innerHTML = `<pre class="bg-slate-100 dark:bg-slate-800 p-4 border border-border overflow-x-auto my-4 font-mono text-sm">${content}</pre>`
        }
      }
    }

    renderMermaid()

    // Cleanup 函数
    return () => {
      isMounted.current = false
    }
  }, [content])

  return <div ref={codeRef} className="flex justify-center my-4" />
}

interface DocArtifactProps {
  content: string
  className?: string
}

// Mermaid 代码块组件
function MermaidCode({ children }: { children?: React.ReactNode }) {
  const codeRef = useRef<HTMLDivElement>(null)
  const isMounted = useRef(true)
  const content = React.Children.toArray(children)
    .map(child => React.isValidElement(child) ? (child as React.ReactElement).props.children : child)
    .join('')

  useEffect(() => {
    isMounted.current = true

    const renderMermaid = async () => {
      // 检查组件是否仍然挂载
      if (!isMounted.current || !codeRef.current || !content) return

      try {
        const { mermaid } = await import('mermaid')
        await mermaid.initialize({ startOnLoad: false, theme: 'default' })
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, content)

        // 再次检查组件是否仍然挂载
        if (isMounted.current && codeRef.current) {
          codeRef.current.innerHTML = svg
        }
      } catch (error) {
        console.error('Mermaid render error:', error)
        if (isMounted.current && codeRef.current) {
          codeRef.current.innerHTML = `<pre class="bg-slate-100 dark:bg-slate-800 p-4 border border-border overflow-x-auto my-4 font-mono text-sm">${content}</pre>`
        }
      }
    }

    renderMermaid()

    // Cleanup 函数
    return () => {
      isMounted.current = false
    }
  }, [content])

  return <div ref={codeRef} className="flex justify-center my-4" />
}

export default function DocArtifact({ content, className }: DocArtifactProps) {
  return (
    <div className={cn('w-full h-full overflow-auto bauhaus-scrollbar', className)}>
      <div className="prose prose-slate dark:prose-invert prose-sm max-w-none w-full min-h-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-50 border-b border-slate-300 dark:border-slate-600 pb-2 mb-4 mt-6">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-50 border-b border-slate-300 dark:border-slate-600 pb-2 mb-3 mt-5">
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
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed mb-4">
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
            <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-200 space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 mb-4 text-slate-700 dark:text-slate-200 space-y-1">
              {children}
            </ol>
          ),
          code: ({ children, className }) => {
            const isInline = !className?.includes('language-')
            const isMermaid = className?.includes('language-mermaid')
            const isChart = className?.includes('language-json-chart')
            return isInline ? (
              <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 border border-border/50 text-sm text-slate-800 dark:text-slate-200 font-mono">
                {children}
              </code>
            ) : isMermaid || isChart ? (
              <code className="text-inherit font-mono">{children}</code>
            ) : (
              <code className="text-inherit font-mono">{children}</code>
            )
          },
          pre: ({ children }) => {
            // 检测是否为 mermaid 或 json-chart 代码块
            const isMermaid = React.Children.toArray(children).some(child => {
              if (React.isValidElement(child)) {
                const element = child as React.ReactElement
                return element.props.className?.includes('language-mermaid')
              }
              return false
            })

            const isChart = React.Children.toArray(children).some(child => {
              if (React.isValidElement(child)) {
                const element = child as React.ReactElement
                return element.props.className?.includes('language-json-chart')
              }
              return false
            })

            // 提取代码内容
            const extractCode = (children: React.ReactNode): string => {
              return React.Children.toArray(children)
                .map(child => React.isValidElement(child) ? (child as React.ReactElement).props.children : child)
                .join('')
            }

            return isMermaid ? (
              <MermaidCode>{children}</MermaidCode>
            ) : isChart ? (
              <ChartRenderer code={extractCode(children)} />
            ) : (
              <pre className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-4 border border-border overflow-x-auto my-4 font-mono text-sm">
                {children}
              </pre>
            )
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-slate-400 dark:border-slate-500 pl-4 italic text-slate-600 dark:text-slate-300 my-4">
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
          // math: ({ children }) => (
          //   <span className="inline-block px-1 py-0.5 font-mono">
          //     {children}
          //   </span>
          // ),
          // inlineMath: ({ children }) => (
          //   <span className="inline font-mono">
          //     {children}
          //   </span>
          // ),
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
    </div>
  )
}

