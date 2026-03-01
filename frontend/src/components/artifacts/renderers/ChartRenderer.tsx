import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts'

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

interface ChartRendererProps {
  code: string
}

/**
 * 检测 JSON 是否完整（流式输出防抖）
 * 简单的启发式检测：检查括号是否平衡
 */
function isJSONComplete(str: string): boolean {
  const trimmed = str.trim()
  if (!trimmed) return false
  
  // 检查是否以 { 开头 } 结尾
  if (trimmed[0] !== '{' || trimmed[trimmed.length - 1] !== '}') {
    return false
  }
  
  // 检查括号平衡
  let braceCount = 0
  let inString = false
  let escapeNext = false
  
  for (const char of trimmed) {
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (char === '\\') {
      escapeNext = true
      continue
    }
    if (char === '"' && !inString) {
      inString = true
      continue
    }
    if (char === '"' && inString) {
      inString = false
      continue
    }
    if (!inString) {
      if (char === '{') braceCount++
      if (char === '}') braceCount--
    }
  }
  
  return braceCount === 0
}

export function ChartRenderer({ code }: ChartRendererProps) {
  // 🔥 防抖：如果 JSON 不完整，显示加载状态而非报错
  if (!isJSONComplete(code)) {
    return (
      <div className="w-full h-[200px] bg-[#1e1e1e] rounded-lg p-4 my-4 border border-gray-700 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-status-info rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-status-info rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-status-info rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm">图表生成中...</span>
        </div>
      </div>
    )
  }

  let config: ChartConfig | null = null
  
  try {
    config = JSON.parse(code.trim())
  } catch (e) {
    // JSON 完整但解析失败（语法错误），显示友好提示
    return (
      <div className="w-full h-[200px] bg-[#1e1e1e] rounded-lg p-4 my-4 border border-gray-700 flex items-center justify-center">
        <div className="text-gray-500 text-sm flex items-center gap-2">
          <span>图表数据格式错误</span>
        </div>
      </div>
    )
  }

  if (!config || !config.items || !Array.isArray(config.items)) {
    return (
      <div className="w-full h-[200px] bg-[#1e1e1e] rounded-lg p-4 my-4 border border-gray-700 flex items-center justify-center">
        <div className="text-gray-500 text-sm">图表数据不完整</div>
      </div>
    )
  }

  const renderChart = () => {
    const xKey = config?.xKey || 'name'
    const yKey = config?.yKey || 'value'
    const color = config?.color || '#3b82f6'
    const colors = config?.colors || DEFAULT_COLORS

    switch (config?.type) {
      case 'line':
        return (
          <LineChart data={config.items}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey={xKey} stroke="#888" tick={{ fontSize: 12 }} />
            <YAxis stroke="#888" tick={{ fontSize: 12 }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                border: '1px solid #374151',
                borderRadius: '6px'
              }} 
            />
            <Line 
              type="monotone" 
              dataKey={yKey} 
              stroke={color} 
              strokeWidth={2}
              dot={{ fill: color, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        )
      
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={config.items}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={100}
              paddingAngle={5}
            >
              {config.items.map((item, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                border: '1px solid #374151',
                borderRadius: '6px'
              }} 
            />
          </PieChart>
        )
      
      case 'bar':
      default:
        return (
          <BarChart data={config.items}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey={xKey} stroke="#888" tick={{ fontSize: 12 }} />
            <YAxis stroke="#888" tick={{ fontSize: 12 }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                border: '1px solid #374151',
                borderRadius: '6px'
              }} 
            />
            <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        )
    }
  }

  return (
    <div className="w-full h-[300px] bg-[#1e1e1e] rounded-lg p-4 my-4 border border-gray-700">
      {config?.title && (
        <h4 className="text-center text-sm font-bold text-gray-300 mb-4">
          {config.title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height={config?.title ? "85%" : "100%"}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  )
}
