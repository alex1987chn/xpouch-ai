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
 *
 * [设计] 蓝本 run-card 步骤行形态：紧凑单行（状态圆标 + 专家色点 + 名称 + 耗时
 * + 展开箭头），点击行展开详情（过程文本 / 链接）。不再用大卡片堆叠。
 *
 * [动画]
 * - 折叠用 CSS grid-rows 过渡；步骤入场用 stagger-item 习语
 * - 自动延迟折叠（全部完成后 1.5s）
 */

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useTranslation } from '@/i18n'
import {
  Brain,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { expertColor } from '@/lib/expertIdentity'
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
  /** 固定的总步骤数（从 plan.created 获取） */
  totalSteps?: number
}

// ============================================================================
// 状态圆标（蓝本 st-ico：18px 圆 + 图标）
// ============================================================================

const StatusDot = ({ status }: { status: ThinkingStep['status'] }) => {
  switch (status) {
    case 'running':
      return (
        <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-accent-brand/15">
          <Loader2 className="h-3 w-3 animate-spin text-accent-brand" />
        </span>
      )
    case 'completed':
      return (
        <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-accent-success/15">
          <Check className="h-3 w-3 text-accent-success" />
        </span>
      )
    case 'failed':
      return (
        <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-accent-destructive/15">
          <XCircle className="h-3 w-3 text-accent-destructive" />
        </span>
      )
    default:
      return <span className="h-[18px] w-[18px] flex-shrink-0 rounded-full bg-surface-tint" />
  }
}

// ============================================================================
// 单步行组件
// ============================================================================

interface StepItemProps {
  step: ThinkingStep
  index: number
}

const StepItem = ({ step, index }: StepItemProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
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
  const hasDetail = !!step.content || !!step.url

  // 格式化耗时
  const formatDuration = (ms?: number) => {
    if (!ms) return null
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
      className={cn('stagger-item', index > 0 && 'border-t border-border-divider')}
    >
      {/* 步骤行：状态圆标 + 专家色点 + 名称 + 耗时 + 展开箭头 */}
      <button
        onClick={() => hasDetail && setOpen(v => !v)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
          hasDetail && 'cursor-pointer hover:bg-surface-tint/50',
          step.status === 'running' && 'bg-surface-tint/30'
        )}
      >
        <StatusDot status={step.status} />
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: expertColor(step.type || 'default') }}
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px] text-content-primary',
            step.status === 'running' && 'font-bold'
          )}
        >
          {label}
          {step.expertName && (
            <span className="font-normal text-content-muted"> · {step.expertName}</span>
          )}
        </span>
        {step.status === 'running' && <span className="shimmer shrink-0" />}
        {step.duration && (
          <span className="shrink-0 text-[11.5px] text-content-muted">
            {formatDuration(step.duration)}
          </span>
        )}
        {hasDetail && (
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 text-content-muted transition-transform duration-200',
              open && 'rotate-90'
            )}
          />
        )}
      </button>

      {/* 展开详情：过程文本 / 链接 */}
      {open && (
        <div className="pb-3 pl-[54px] pr-4">
          {step.content && (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-content-secondary">
              {step.content}
            </p>
          )}
          {step.url && (
            <a
              href={step.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:text-accent-hover hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {step.url.length > 50 ? step.url.slice(0, 50) + '...' : step.url}
            </a>
          )}
        </div>
      )}
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
  // 使用 ref 记录是否已经自动折叠过，避免重复触发
  const hasAutoCollapsed = useRef(false)
  // 滚动容器 ref，用于自动滚动到底部
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // 统计
  const dynamicTotalSteps = steps.length
  const totalSteps = fixedTotalSteps ?? dynamicTotalSteps  // 优先使用固定的总步骤数
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
    // 只有从未折叠过且满足条件时才折叠
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
  }, [isAllDone, isExpanded, isThinking]) // isThinking/isExpanded 参与判定必须入依赖，
  // 否则思考先于正文结束时（isAllDone 先真、isThinking 后假）折叠 effect 不会重跑，永不折叠

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current)
      }
    }
  }, [])

  // 自动滚动到底部（useLayoutEffect 避免滚动闪烁）
  useLayoutEffect(() => {
    if (scrollContainerRef.current && isExpanded) {
      const container = scrollContainerRef.current
      container.scrollTop = container.scrollHeight
    }
  }, [steps, isExpanded])

  if (steps.length === 0) return null

  return (
    <div className={cn("mb-4 overflow-hidden rounded-lg border border-border-divider bg-surface-card", className)}>
      {/* 头部 - 点击展开/收起 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-surface-tint/50"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-tint"><Brain className="h-3.5 w-3.5 text-content-secondary" /></span>
          <span className="font-bold text-content-primary">{t('thinkingProcess')}</span>
          <span className="text-xs font-medium text-content-muted">
            {completedSteps}/{totalSteps}
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
          {failedSteps > 0 && (
            <span className="flex items-center gap-0.5 text-micro text-status-offline">
              <XCircle className="w-3 h-3" />
              {failedSteps}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-content-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-content-muted" />
          )}
        </div>
      </button>

      {/* 展开内容 - CSS grid-rows 折叠动画 */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="max-h-[300px] overflow-y-auto border-t border-border-divider"
          >
            {steps.map((step, index) => (
              // 使用 index 作为 key 的一部分，确保唯一性
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
