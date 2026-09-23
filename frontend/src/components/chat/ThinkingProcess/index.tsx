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
 * [2026-09-13 按专家分组] 任务步骤**按专家成组**渲染：组头 = 专家（识别色 + 名字 +
 * 任务数 + 进行中），组内 = 该专家的任务行（行标题取任务描述，产出正文在其下）。
 * 平铺时代每行都是「任务执行」+ 原始 expert_type，既看不出谁在干活，也看不出哪几行
 * 是同一个人；分组后串行退化成"一位接一位"，并行（C2 波次扇出）时多个组同时亮。
 * 分组规则见 lib/thinkingGroups.ts。
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
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { expertColor, expertDotStyle } from '@/lib/expertIdentity'
import { useExpertLabel } from '@/hooks/useExpertLabel'
import { expertGroupStatus, groupThinkingSteps } from '@/lib/thinkingGroups'
import {
  ARTIFACT_TYPE_LABEL_KEY,
  artifactTypeColor,
  artifactTypeIcon,
} from '@/lib/artifactPresentation'
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
  /** 打开某条产物的查看器（复用 ArtifactViewerModal）；不传则卡片不可点 */
  onOpenArtifact?: (artifactId: string) => void
  /** 初始是否展开（历史消息传 false，避免"展开→自动收起"的闪烁） */
  defaultExpanded?: boolean
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
  onOpenArtifact?: (artifactId: string) => void
  /** 是否渲染在专家组内：组内不重复画专家色点（组头已有），行标题改用任务描述 */
  inExpertGroup?: boolean
}

/** 步骤产出的产物卡片：点击交给调用方打开查看器（复用 ArtifactViewerModal）。
    形态刻意比画廊卡更轻——它嵌在紧凑的步骤区里，重卡片会显得突兀。 */
const StepArtifactCard = ({
  artifact,
  onOpen,
}: {
  artifact: NonNullable<ThinkingStep['artifacts']>[number]
  onOpen?: (artifactId: string) => void
}) => {
  const { t } = useTranslation()
  const Icon = artifactTypeIcon(artifact.type)
  const labelKey = ARTIFACT_TYPE_LABEL_KEY[artifact.type]
  const typeLabel = labelKey ? t(labelKey as Parameters<typeof t>[0]) : artifact.type
  const title = artifact.title || typeLabel
  const clickable = !!onOpen

  const inner = (
    <>
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
        style={{ backgroundColor: `${artifactTypeColor(artifact.type)}1f` }}
      >
        <Icon className="h-3 w-3" style={{ color: artifactTypeColor(artifact.type) }} />
      </span>
      <span className="min-w-0 flex-1 truncate text-caption text-content-primary">{title}</span>
      <span className="flex-shrink-0 text-nano text-content-muted">{typeLabel}</span>
      {clickable && (
        <ChevronRight className="h-3 w-3 flex-shrink-0 text-content-muted transition-transform duration-200 group-hover:translate-x-0.5" />
      )}
    </>
  )

  const base =
    'flex w-full items-center gap-2 rounded-md border border-border-divider bg-surface-card px-2.5 py-1.5 text-left'

  if (!clickable) {
    return <div className={base}>{inner}</div>
  }
  return (
    <button
      type="button"
      onClick={() => onOpen!(artifact.id)}
      title={t('preview')}
      className={cn(
        base,
        'group cursor-pointer transition-colors hover:border-border-hover hover:bg-surface-tint/40'
      )}
    >
      {inner}
    </button>
  )
}

const StepItem = ({ step, index, onOpenArtifact, inExpertGroup = false }: StepItemProps) => {
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
  // 组内任务行：标题是任务本身（描述）。计划里的 description 常是整句长文，
  // 一行全量渲染会让整个面板显得「字很大」——行名只取前 30 字（详情/摘要就在下方，
  // 不丢信息）；蓝图 run-card 的步骤也是短名（「读取现有认证流程」）而非全文。
  const description = inExpertGroup ? step.taskDescription : undefined
  const label = description
    ? description.length > 30
      ? `${description.slice(0, 30)}…`
      : description
    : typeLabels[step.type || 'default']
  const hasDetail = !!step.content || !!step.url
  // 组内少了专家色点（8px + 12px 间距），详情/产物块的缩进随之左移
  const indent = inExpertGroup ? 'pl-[46px]' : 'pl-[66px]'

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
          'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
          hasDetail && 'cursor-pointer hover:bg-surface-tint/50',
          step.status === 'running' && 'bg-surface-tint/30'
        )}
      >
        <StatusDot status={step.status} />
        {!inExpertGroup && (
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: expertColor(step.expertType || step.type || 'default') }}
          />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-xs text-content-primary',
            step.status === 'running' && 'font-bold'
          )}
        >
          {label}
          {/* 组内不重复署名（组头已写着是谁）；编排类步骤保留署名（智能路由/任务规划） */}
          {!inExpertGroup && step.expertName && (
            <span className="font-normal text-content-muted"> · {step.expertName}</span>
          )}
        </span>
        {step.status === 'running' && <span className="shimmer shrink-0" />}
        {step.duration && (
          <span className="shrink-0 text-caption text-content-muted">
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

      {/* 产出摘要：默认可见（3 行截断），点击展开全文。
          此前 step.content 只在 open 时渲染 —— 执行期间每个任务的产出必须点击
          才能看到，用户感知就是「一直转圈、页面没内容」。现改为摘要常驻，
          正文随执行逐任务长出来。 */}
      {hasDetail && !open && step.content && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'block w-full cursor-pointer px-4 pb-2.5 pt-1 text-left transition-colors hover:bg-surface-tint/50',
            indent
          )}
        >
          <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-content-secondary">
            {step.content}
          </p>
        </button>
      )}

      {/* 工具活动行：任务执行期间的「正在调什么工具」。仅 running 态渲染——
          终态信息（耗时/成败汇总）由运行时间线承载，这里只做执行中的实时感知。
          calling 态微转圈区分「模型在想」与「在等工具」。 */}
      {step.toolActivity && step.status === 'running' && (
        <div
          className={cn(
            'flex items-center gap-1.5 pb-1.5 pt-0.5 text-caption text-content-muted',
            indent
          )}
        >
          <Wrench className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono">{step.toolActivity.tool}</span>
          {step.toolActivity.source === 'mcp' && (
            <span className="shrink-0 rounded-sm border border-border-divider px-1 text-nano">MCP</span>
          )}
          {step.toolActivity.state === 'calling' ? (
            <>
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span>
                {(step.toolActivity.attempt ?? 1) > 1
                  ? t('thinkingToolRetrying')
                  : t('thinkingToolCalling')}
              </span>
            </>
          ) : (
            <span
              className={cn(
                'shrink-0',
                step.toolActivity.success ? 'text-status-online' : 'text-status-offline'
              )}
            >
              {step.toolActivity.success ? '✓' : '✗'}
              {step.toolActivity.durationMs != null &&
                ` ${(step.toolActivity.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
      )}

      {/* 展开详情：过程文本 / 链接 */}
      {open && (
        <div className={cn('pb-3 pr-4 pt-1', indent)}>
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
              className="mt-1.5 inline-flex items-center gap-1 font-mono text-tiny text-accent hover:text-accent-hover hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {step.url.length > 50 ? step.url.slice(0, 50) + '...' : step.url}
            </a>
          )}
        </div>
      )}

      {/* 该步骤产出的产物卡片（常驻可见，点击打开查看器）。
          放在内容下方：用户既看到「这一步产出了什么」（内容摘要），
          也能直接点开成品——此前产物只能去右栏画布/画廊找。 */}
      {step.artifacts && step.artifacts.length > 0 && (
        <div className={cn('flex flex-col gap-1.5 pb-2.5 pr-4', indent)}>
          {step.artifacts.map(a => (
            <StepArtifactCard key={a.id} artifact={a} onOpen={onOpenArtifact} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 专家组头（一位专家一段活：识别色 + 名字 + 任务数 + 状态）
// ============================================================================

const ExpertGroupHeader = ({
  expertType,
  steps,
  index,
}: {
  expertType: string
  steps: ThinkingStep[]
  index: number
}) => {
  const { t } = useTranslation()
  const expertLabelOf = useExpertLabel()
  const status = expertGroupStatus(steps)

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
      className={cn(
        // 无底色条：层级靠「字号 + 字重」（面板头 14 bold > 组头 12 semibold > 步骤 12 regular），
        // 与蓝图 run-card 的普通行 + 分隔线同一思路——此前的 tint 全宽色带视觉权重压过了面板头
        'stagger-item flex items-center gap-2 px-4 py-1.5',
        index > 0 && 'border-t border-border-divider'
      )}
    >
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={expertDotStyle(expertType)} />
      <span className="min-w-0 truncate text-xs font-semibold text-content-primary">
        {expertLabelOf(expertType)}
      </span>
      {/* 单个任务不报数（"1 个任务"是纯噪音），多任务时才说明这位专家分了几个 */}
      {steps.length > 1 && (
        <span className="flex-shrink-0 text-caption text-content-muted">
          {t('thinkingGroupTasks', { count: steps.length })}
        </span>
      )}
      {status === 'running' && (
        <span className="flex items-center gap-1 text-caption text-accent-warning">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('running')}
        </span>
      )}
      {status === 'failed' && (
        <span className="flex items-center gap-1 text-caption text-status-offline">
          <XCircle className="h-3 w-3" />
          {t('thinkingTaskFailed')}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// 主组件
// ============================================================================

export default function ThinkingProcess({
  steps,
  isThinking,
  className,
  totalSteps: fixedTotalSteps,
  onOpenArtifact,
  defaultExpanded = true,
}: ThinkingProcessProps) {
  const { t } = useTranslation()
  // 历史消息的面板默认折叠：它们早已结束，一进来展开再自动收起会闪一下；
  // 折叠态仍是一行摘要（N/N 完成），点击即可展开回看。
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const autoCollapseTimer = useRef<NodeJS.Timeout | null>(null)
  // 使用 ref 记录是否已经自动折叠过，避免重复触发
  const hasAutoCollapsed = useRef(false)
  // 滚动容器 ref，用于自动滚动到底部
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // 统计：只数**任务**步骤（路由/规划不算"第几个任务"）。
  // 分母优先用计划的预估任务数（任务还没开始跑时也能显示 0/6），任务数超过预估时
  // 以实际为准——此前分子数的是全部步骤、分母是计划任务数，出现过「2/1」这种读数。
  const taskSteps = steps.filter(s => s.type === 'execution')
  const completedTasks = taskSteps.filter(s => s.status === 'completed').length
  const totalTasks = Math.max(fixedTotalSteps ?? 0, taskSteps.length)
  const runningSteps = steps.filter(s => s.status === 'running').length
  const failedSteps = steps.filter(s => s.status === 'failed').length
  const isAllDone = steps.length > 0 && runningSteps === 0

  // 按专家分组（纯函数，见 lib/thinkingGroups.ts）
  const rows = groupThinkingSteps(steps)

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
      {/* 行高克制：py-2.5 + 20px 图标（原 py-3 + 24px 偏厚重，整块面板显得压头） */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-surface-tint/50"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-tint"><Brain className="h-3 w-3 text-content-secondary" /></span>
          <span className="font-bold text-content-primary">{t('thinkingProcess')}</span>
          {/* 任务进度：还没规划出任务时不显示（0/0 无意义） */}
          {totalTasks > 0 && (
            <span className="text-xs font-medium text-content-muted">
              {completedTasks}/{totalTasks}
            </span>
          )}
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
            {rows.map((row, rowIndex) =>
              row.kind === 'expert' ? (
                <div key={`expert-${row.expertType}-${rowIndex}`}>
                  <ExpertGroupHeader
                    expertType={row.expertType}
                    steps={row.steps}
                    index={rowIndex}
                  />
                  {row.steps.map((step, stepIndex) => (
                    <StepItem
                      key={step.id}
                      step={step}
                      index={stepIndex + 1}
                      inExpertGroup
                      onOpenArtifact={onOpenArtifact}
                    />
                  ))}
                </div>
              ) : (
                <StepItem
                  key={`${row.step.id}-${rowIndex}`}
                  step={row.step}
                  index={rowIndex}
                  onOpenArtifact={onOpenArtifact}
                />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 导出类型
export type { ThinkingProcessProps }
