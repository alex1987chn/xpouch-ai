/**
 * =============================
 * 思维链可视化组件 (ThinkingProcess)
 * =============================
 *
 * [架构层级] Layer 4 - 聊天界面子组件
 *
 * [功能]
 * - Server-Driven UI：实时展示 LLM 思考过程
 * - 支持多种步骤类型：search/reading/analysis/coding/planning/writing
 * - 自动展开/折叠动画
 * - 工业风设计，匹配整体 UI
 *
 * [动画]
 * - framer-motion 实现平滑折叠
 * - 自动延迟折叠（全部完成后 1.5s）
 */

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  BookOpen, 
  Brain, 
  Code, 
  FileText, 
  PenTool, 
  ChevronDown, 
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  FileOutput,  // 🔥 新增：Artifact 类型图标
  Database  // 🔥 新增：Memory 类型图标
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ThinkingStep } from '@/types'

// ============================================================================
// 类型定义
// ============================================================================

interface ThinkingProcessProps {
  /** 思考步骤列表 */
  steps: ThinkingStep[]
  /** 是否正在思考中（控制自动展开/折叠） */
  isThinking: boolean
  /** 自定义类名 */
  className?: string
  /** 🔥 固定的总步骤数（从 plan.created 获取） */
  totalSteps?: number
}

// ============================================================================
// 图标映射
// ============================================================================

const typeIcons: Record<NonNullable<ThinkingStep['type']>, React.ElementType> = {
  search: Search,
  reading: BookOpen,
  analysis: Brain,
  coding: Code,
  planning: FileText,
  writing: PenTool,
  artifact: FileOutput,  // 🔥 Artifact 生成类型
  memory: Database,  // 🔥 新增：Memory 类型图标
  execution: Code,  // 🔥 任务执行类型
  default: Brain
}

const typeLabels: Record<NonNullable<ThinkingStep['type']>, string> = {
  search: '搜索',
  reading: '深度阅读',
  analysis: '分析思考',
  coding: '代码生成',
  planning: '任务规划',
  writing: '写作生成',
  artifact: '生成产物',
  memory: '记忆检索',  // 🔥 新增：Memory 类型标签
  execution: '任务执行',  // 🔥 任务执行类型
  default: '思考'
}

// ============================================================================
// 状态图标组件
// ============================================================================

const StatusIcon = ({ status }: { status: ThinkingStep['status'] }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />
    default:
      return <div className="w-4 h-4 rounded-full bg-muted" />
  }
}

// ============================================================================
// 单步组件
// ============================================================================

interface StepItemProps {
  step: ThinkingStep
  index: number
}

const StepItem = ({ step, index }: StepItemProps) => {
  const Icon = typeIcons[step.type || 'default']
  const label = typeLabels[step.type || 'default']
  const isReading = step.type === 'reading'
  
  // 格式化耗时
  const formatDuration = (ms?: number) => {
    if (!ms) return null
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "relative flex items-start gap-3 p-3 rounded-lg border",
        step.status === 'running' && "bg-yellow-500/5 border-yellow-500/20",
        step.status === 'completed' && "bg-green-500/5 border-green-500/20",
        step.status === 'failed' && "bg-red-500/5 border-red-500/20",
        step.status === 'pending' && "bg-muted/30 border-border"
      )}
    >
      {/* 步骤序号 */}
      <div className="flex-shrink-0 w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-mono font-bold text-muted-foreground">
        {index + 1}
      </div>
      
      {/* 图标 */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
        step.type === 'search' && "bg-blue-500/10 text-blue-500",
        step.type === 'reading' && "bg-purple-500/10 text-purple-500",
        step.type === 'analysis' && "bg-amber-500/10 text-amber-500",
        step.type === 'coding' && "bg-emerald-500/10 text-emerald-500",
        step.type === 'planning' && "bg-cyan-500/10 text-cyan-500",
        step.type === 'writing' && "bg-pink-500/10 text-pink-500",
        step.type === 'artifact' && "bg-orange-500/10 text-orange-500",
        step.type === 'memory' && "bg-indigo-500/10 text-indigo-500",  // 🔥 新增：Memory 类型样式
        step.type === 'execution' && "bg-emerald-500/10 text-emerald-500",  // 🔥 任务执行类型样式
        (!step.type || step.type === 'default') && "bg-gray-500/10 text-gray-500"
      )}>
        <Icon className="w-4 h-4" />
      </div>
      
      {/* 内容 */}
      <div className="flex-1 min-w-0">
        {/* 标题行 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="text-xs font-bold text-foreground">{step.expertName}</span>
          {step.duration && (
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              {formatDuration(step.duration)}
            </span>
          )}
        </div>
        
        {/* 描述内容 */}
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {step.content}
        </p>
        
        {/* 🔥 Reading 类型特殊显示 URL */}
        {isReading && step.url && (
          <a 
            href={step.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs text-purple-500 hover:text-purple-600 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            {step.url.length > 50 ? step.url.slice(0, 50) + '...' : step.url}
          </a>
        )}
      </div>
      
      {/* 状态图标 */}
      <div className="flex-shrink-0">
        <StatusIcon status={step.status} />
      </div>
    </motion.div>
  )
}

// ============================================================================
// 主组件
// ============================================================================

export default function ThinkingProcess({ steps, isThinking, className, totalSteps: fixedTotalSteps }: ThinkingProcessProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const autoCollapseTimer = useRef<NodeJS.Timeout | null>(null)
  // 🔥 修复：使用 ref 记录是否已经自动折叠过，避免重复触发
  const hasAutoCollapsed = useRef(false)
  // 🔥🔥🔥 新增：滚动容器 ref，用于自动滚动到底部
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  // 统计
  const dynamicTotalSteps = steps.length
  const totalSteps = fixedTotalSteps ?? dynamicTotalSteps  // 🔥 优先使用固定的总步骤数
  const completedSteps = steps.filter(s => s.status === 'completed').length
  const failedSteps = steps.filter(s => s.status === 'failed').length
  const runningSteps = steps.filter(s => s.status === 'running').length
  const isAllDone = dynamicTotalSteps > 0 && runningSteps === 0
  
  // 自动展开/折叠逻辑
  useEffect(() => {
    // 当开始思考时，自动展开
    if (isThinking) {
      setIsExpanded(true)
      hasAutoCollapsed.current = false // 重置折叠标志
      // 清除之前的定时器
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current)
        autoCollapseTimer.current = null
      }
    }
  }, [isThinking])
  
  // 全部完成后延迟折叠 - 只执行一次
  useEffect(() => {
    // 🔥 修复：只有从未折叠过且满足条件时才折叠
    if (isAllDone && isExpanded && !isThinking && !hasAutoCollapsed.current) {
      hasAutoCollapsed.current = true // 标记已折叠
      autoCollapseTimer.current = setTimeout(() => {
        setIsExpanded(false)
      }, 1500) // 1.5 秒后自动折叠
    }
    
    return () => {
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current)
      }
    }
  }, [isAllDone]) // 🔥 修复：只依赖 isAllDone，避免其他状态变化导致重复触发
  
  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current)
      }
    }
  }, [])
  
  // 🔥🔥🔥 新增：自动滚动到底部
  // React 19: 使用 useLayoutEffect 避免滚动闪烁
  useLayoutEffect(() => {
    if (scrollContainerRef.current && isExpanded) {
      const container = scrollContainerRef.current
      container.scrollTop = container.scrollHeight
    }
  }, [steps, isExpanded])

  if (steps.length === 0) return null

  return (
    <div className={cn("mb-4 border border-border bg-muted/30 rounded-lg overflow-hidden", className)}>
      {/* 头部 - 点击展开/收起 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Brain className="w-4 h-4 text-primary" />
          <span className="font-medium">思考过程</span>
          <span className="text-xs text-muted-foreground">
            ({completedSteps}/{totalSteps})
          </span>
          {runningSteps > 0 && (
            <span className="flex items-center gap-1 text-xs text-yellow-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              进行中
            </span>
          )}
          {isAllDone && (
            <span className="text-xs text-green-600">
              已完成
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* 状态指示点 */}
          <div className="flex items-center gap-1">
            {failedSteps > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-red-500">
                <XCircle className="w-3 h-3" />
                {failedSteps}
              </span>
            )}
          </div>
          
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {/* 展开内容 - 带动画 */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div 
              ref={scrollContainerRef}
              className="border-t border-border px-4 py-3 space-y-2 max-h-[300px] overflow-y-auto bauhaus-scrollbar"
            >
              {steps.map((step, index) => (
                // 🔥 修复：使用 index 作为 key 的一部分，确保唯一性
                <StepItem key={`${step.id}-${index}`} step={step} index={index} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// 导出类型
export type { ThinkingProcessProps }
