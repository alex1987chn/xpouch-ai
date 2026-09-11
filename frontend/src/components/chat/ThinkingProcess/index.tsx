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
 * - 折叠用 CSS grid-rows 过渡；步骤入场用 stagger-item 习语（原 framer-motion 已移除）
 * - 自动延迟折叠（全部完成后 1.5s）
 */

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useTranslation } from '@/i18n'
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



// ============================================================================
// 状态图标组件
// ============================================================================

const StatusIcon = ({ status }: { status: ThinkingStep['status'] }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-accent-brand animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-status-online" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-status-offline" />
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
  const { t } = useTranslation()
  const Icon = typeIcons[step.type || 'default']
  const typeLabels: Record<NonNullable<ThinkingStep['type']>, string> = {
    search: t('thinkingSearch'),
    reading: t('thinkingReading'),
    analysis: t('thinkingAnalysis'),
    coding: t('thinkingCoding'),
    planning: t('thinkingPlanning'),
    writing: t('thinkingWriting'),
    artifact: t('thinkingArtifact'),
    memory: t('thinkingMemory'),
    execution: t('thinkingExecution'),
    default: t('thinkingDefault')
  }
  const label = typeLabels[step.type || 'default']
  const isReading = step.type === 'reading'
  
  // 格式化耗时
  const formatDuration = (ms?: number) => {
    if (!ms) return null
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
      className={cn(
        "stagger-item relative flex items-start gap-3 p-3 rounded-lg border",
        step.status === 'running' && "bg-accent-brand/5 border-accent-brand/20",
        step.status === 'completed' && "bg-status-online/5 border-status-online/20",
        step.status === 'failed' && "bg-status-offline/5 border-status-offline/20",
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
        step.type === 'search' && "bg-status-info/10 text-status-info",
        step.type === 'reading' && "bg-purple-500/10 text-purple-500",
        step.type === 'analysis' && "bg-amber-500/10 text-amber-500",
        step.type === 'coding' && "bg-emerald-500/10 text-emerald-500",
        step.type === 'planning' && "bg-cyan-500/10 text-cyan-500",
        step.type === 'writing' && "bg-pink-500/10 text-pink-500",
        step.type === 'artifact' && "bg-orange-500/10 text-orange-500",
        step.type === 'memory' && "bg-indigo-500/10 text-indigo-500",  // 🔥 新增：Memory 类型样式
        step.type === 'execution' && "bg-emerald-500/10 text-emerald-500",  // 🔥 任务执行类型样式
        (!step.type || step.type === 'default') && "bg-content-muted/10 text-content-muted"
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
            <span className="text-micro font-mono text-muted-foreground ml-auto">
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
    </div>
  )
}

// ============================================================================
// 主组件
// ============================================================================

export default function ThinkingProcess({ steps, isThinking, className, totalSteps: fixedTotalSteps }: ThinkingProcessProps) {
  const { t } = useTranslation()
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
  }, [isAllDone, isExpanded, isThinking]) // 修复：isThinking/isExpanded 参与判定必须入依赖，
  // 否则思考先于正文结束时（isAllDone 先真、isThinking 后假）折叠 effect 不会重跑，永不折叠
  
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
          <span className="font-medium">{t('thinkingProcess')}</span>
          <span className="text-xs text-muted-foreground">
            ({completedSteps}/{totalSteps})
          </span>
          {runningSteps > 0 && (
            <span className="flex items-center gap-1 text-xs text-accent-warning">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('thinkingInProgress')}
            </span>
          )}
          {isAllDone && (
            <span className="text-xs text-status-online">
              {t('thinkingCompleted')}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* 状态指示点 */}
          <div className="flex items-center gap-1">
            {failedSteps > 0 && (
              <span className="flex items-center gap-0.5 text-micro text-status-offline">
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
      
      {/* 展开内容 - CSS grid-rows 折叠动画（原 framer-motion AnimatePresence） */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="border-t border-border px-4 py-3 space-y-2 max-h-[300px] overflow-y-auto bauhaus-scrollbar"
          >
            {steps.map((step, index) => (
              // 🔥 修复：使用 index 作为 key 的一部分，确保唯一性
              <StepItem key={`${step.id}-${index}`} step={step} index={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// 导出类型
export type { ThinkingProcessProps }
