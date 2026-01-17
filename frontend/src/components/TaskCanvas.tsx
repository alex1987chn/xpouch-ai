import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X, ChevronDown, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'
import { useCanvasStore } from '@/store/canvasStore'

interface TaskNode {
  id: string
  title: string
  status: 'pending' | 'in-progress' | 'completed'
  children?: TaskNode[]
  color?: string
  icon?: string
  description?: string
}

interface TaskCanvasProps {
  className?: string
  showHeader?: boolean
}

export default function TaskCanvas({ className, showHeader = true }: TaskCanvasProps) {
  const { tasks, updateAllTasks, magicColor, setMagicColor, scale, setScale, offsetX, offsetY, setOffset, resetView } = useCanvasStore()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const canvasRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // 拖动状态
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // 监听魔法修改
  useEffect(() => {
    if (magicColor) {
      // 当有魔法颜色时，高亮最近的任务节点
      const timer = setTimeout(() => {
        setMagicColor(null) // 3秒后清除魔法效果
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [magicColor, setMagicColor])

  // 缩放处理（以鼠标位置为中心）
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()

    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newScale = Math.min(Math.max(scale + delta, 0.5), 2)

    if (newScale !== scale) {
      // 计算缩放中心（鼠标相对于画布容器的位置）
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // 调整偏移量以保持鼠标位置不变
      const scaleChange = newScale / scale
      const newOffsetX = mouseX - (mouseX - offsetX) * scaleChange
      const newOffsetY = mouseY - (mouseY - offsetY) * scaleChange

      setScale(newScale)
      setOffset(newOffsetX, newOffsetY)
    }
  }

  // 拖动处理
  const handleMouseDown = (e: React.MouseEvent) => {
    // 只在按住左键且不在任务节点上时启用拖动
    if (e.button === 0 && e.target === canvasRef.current || e.target === contentRef.current) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY })
      e.preventDefault()
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const newOffsetX = e.clientX - dragStart.x
      const newOffsetY = e.clientY - dragStart.y
      setOffset(newOffsetX, newOffsetY)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // 全局鼠标释放事件（防止拖动到组件外部后状态不一致）
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false)
    document.addEventListener('mouseup', handleGlobalMouseUp)
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])
  
  // 模拟任务数据
  const handleTaskBreakdown = () => {
    const mockTasks: TaskNode[] = [
      {
        id: '1',
        title: '分析用户需求',
        status: 'pending',
        children: [
          {
            id: '1-1',
            title: '拆解为子任务',
            status: 'pending',
            children: [
              {
                id: '1-1-1',
                title: '分配给搜索专家',
                status: 'in-progress',
                children: [
                  {
                    id: '1-1-1-1',
                    title: '专家执行搜索',
                    status: 'completed'
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        id: '2',
        title: '设计前端界面',
        status: 'pending'
      },
      {
        id: '3',
        title: '实现后端接口',
        status: 'pending'
      }
    ]
    setTasks(mockTasks)
  }

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const renderNode = (node: TaskNode, level: number = 0): JSX.Element => {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children && node.children.length > 0
    
    // 应用魔法颜色
    const nodeColor = node.color || magicColor
    
    const statusColors = {
      pending: 'border-l-yellow-400 bg-yellow-100/40 dark:bg-yellow-900/30',
      'in-progress': 'border-blue-400 bg-blue-100/40 dark:bg-blue-900/30',
      completed: 'border-green-400 bg-green-100/40 dark:bg-green-900/30'
    }
    
    const statusIcon = {
      pending: '○',
      'in-progress': '◉',
      completed: '✓'
    }
    
    // 魔法效果样式
    const magicStyle = nodeColor ? {
      backgroundColor: nodeColor,
      borderColor: nodeColor,
      boxShadow: `0 0 20px ${nodeColor}40`,
      transform: 'scale(1.02)'
    } : {}

    return (
      <div
        className="relative transition-all duration-500"
        style={{ marginLeft: `${level * 24}px`, ...magicStyle }}
      >
        {/* 节点 */}
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md',
            statusColors[node.status],
            magicColor && 'ring-2 ring-opacity-50'
          )}
          onClick={() => toggleNode(node.id)}
        >
          <span className="text-lg">{statusIcon[node.status]}</span>
          <span className="flex-1 font-medium">{node.title}</span>
          {hasChildren && (
            <div className="flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          )}
        </div>

        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <div className="mt-2 border-l-2 border-gray-300 dark:border-gray-700 ml-6 pl-2">
            {node.children!.map(child => (
              <div key={child.id}>
                {renderNode(child, level + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={canvasRef}
      className={cn(
        'flex flex-col h-full bg-gray-200 dark:bg-gray-800 overflow-hidden relative',
        className
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* 画布头部 - 根据showHeader控制显示 */}
      {showHeader && (
        <div className="sticky top-0 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
              任务画布
            </h2>
            <button
              onClick={resetView}
              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm transition-colors"
              title="重置视图"
            >
              重置
            </button>
          </div>
        </div>
      )}

      {/* 任务画布 - 可缩放和拖动区域 */}
      <div
        ref={contentRef}
        className={cn('flex-1 overflow-hidden relative', showHeader ? 'p-6' : 'p-8')}
        style={{
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          transformOrigin: '0 0'
        }}
      >
        {tasks.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center text-gray-500 py-12">
            <div className="text-center max-w-md space-y-6">
              {/* 图标 */}
              <div className="flex justify-center">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-200 to-purple-200 dark:from-indigo-800/30 dark:to-purple-800/30 flex items-center justify-center">
                  <Sparkles className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>

              {/* 文字提示 */}
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">
                  开始你的任务拆解之旅
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  在右侧对话框中描述你想完成的任务，AI 会帮你将其拆解为可执行的子任务
                </p>
              </div>

              {/* 示例提示 */}
              <div className="pt-6 border-t border-gray-300 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  试试这些示例：
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="px-4 py-3 bg-white dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 shadow-sm">
                    "帮我创建一个待办事项应用"
                  </div>
                  <div className="px-4 py-3 bg-white dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 shadow-sm">
                    "设计一个电商网站"
                  </div>
                  <div className="px-4 py-3 bg-white dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 shadow-sm">
                    "学习 React 框架"
                  </div>
                  <div className="px-4 py-3 bg-white dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 shadow-sm">
                    "分析竞品数据"
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map(task => (
              <div key={task.id}>
                {renderNode(task)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 缩放指示器 */}
      <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg text-sm font-medium">
        {Math.round(scale * 100)}%
      </div>
    </div>
  )
}
