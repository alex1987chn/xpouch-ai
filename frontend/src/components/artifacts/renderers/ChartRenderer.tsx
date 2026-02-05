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

export function ChartRenderer({ code }: ChartRendererProps) {
  let config: ChartConfig | null = null
  
  try {
    config = JSON.parse(code.trim())
  } catch (e) {
    return (
      <div className="text-gray-500 text-xs p-4 bg-gray-500/10 rounded border border-gray-500/20">
        <div className="font-semibold mb-1">⚠️ JSON 解析错误</div>
        <div>无法解析图表数据</div>
      </div>
    )
  }

  if (!config || !config.items || !Array.isArray(config.items)) {
    return (
      <div className="text-gray-500 text-xs p-4 bg-gray-500/10 rounded border border-gray-500/20">
        <div className="font-semibold mb-1">⚠️ 数据格式错误</div>
        <div>缺少 items 字段或格式不正确</div>
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
