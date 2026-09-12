/**
 * TaskControlPage（原 RunTimelinePage 演进）
 *
 * [设计] 一次运行 = 一张任务控制视图（docs/design 蓝本）：
 * 左侧时间线（专家识别色标注每步归属 + 琥珀色审批行），
 * 右侧执行计划卡（thread 的 execution_plan.sub_tasks）+ 关联产物。
 *
 * [审批边界] 裁决动作必须回到会话上下文执行（resumeChat 是 SSE 流，
 * 消费端在聊天 store）——本页的审批行是注意力层：跳转到工作台对应线程裁决。
 *
 * [实时性] run 活动期间 timeline 每 3s refetch（事件账本是 append-only，
 * 增量安全）；终态停止轮询。
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Clock, AlertCircle, CheckCircle, Loader2, ChevronRight, ExternalLink } from 'lucide-react'
import { format, formatDistanceToNow, differenceInSeconds } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useTranslation } from '@/i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { useState, useCallback, useMemo } from 'react'

import { useRunDetails, useRunTimeline } from '@/hooks/queries/useRunTimelineQuery'
import { useThreadArtifactsQuery } from '@/hooks/queries/useArtifactsQuery'
import { ArtifactViewerModal } from '@/components/artifacts/ArtifactViewerModal'
import { artifactTypeChipStyle } from '@/lib/artifactPresentation'
import { getConversation } from '@/services/chat'
import type { RunEvent, RunStatus } from '@/types/run'
import { getEventDisplayName, getEventCategory, ACTIVE_RUN_STATUSES } from '@/types/run'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PayloadDrawer } from './PayloadDrawer'
import { expertColor, expertDisplayName } from '@/lib/expertIdentity'

// ============================================
// 事件图标（沿用原配色：类别身份色，阶段 3 统一）
// ============================================

const eventIconConfig: Record<string, { icon: typeof Clock; color: string }> = {
 lifecycle: { icon: Clock, color: 'text-content-muted' },
 router: { icon: Clock, color: 'text-accent-info' },
 plan: { icon: Clock, color: 'text-accent-info' },
 hitl: { icon: AlertCircle, color: 'text-accent-warning' },
 task: { icon: Loader2, color: 'text-accent-brand' },
 artifact: { icon: CheckCircle, color: 'text-accent-success' },
 other: { icon: Clock, color: 'text-content-secondary' },
}

function EventIcon({ eventType }: { eventType: string }) {
 const category = getEventCategory(eventType as never)
 const config = eventIconConfig[category] || eventIconConfig.other
 const Icon = config.icon

 const isTerminal = ['run_completed', 'run_failed', 'run_cancelled', 'run_timed_out'].includes(eventType)
 const isFailed = ['run_failed', 'run_cancelled', 'run_timed_out', 'task_failed', 'hitl_rejected'].includes(eventType)

 if (isTerminal || isFailed) {
  const FailedIcon = eventType === 'run_completed' ? CheckCircle : AlertCircle
  return (
   <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-theme-card border-border-default bg-surface-card">
    <FailedIcon className={cn('h-4 w-4', eventType === 'run_completed' ? 'text-status-online' : 'text-status-offline')} />
   </div>
  )
 }

 return (
  <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-theme-card border-border-default bg-surface-card">
   <Icon className={cn('h-4 w-4', config.color, event_type_spinning(eventType) && 'animate-spin')} />
  </div>
 )
}

/** 仅"进行中"语义的图标自转（任务开始/生命周期启动），完成态不转 */
function event_type_spinning(eventType: string): boolean {
 return eventType === 'task_started' || eventType === 'run_started' || eventType === 'run_created'
}

// ============================================
// 时间线事件行（新增专家归属标注）
// ============================================

interface TimelineEventItemProps {
 event: RunEvent
 isLast: boolean
 isSelected: boolean
 onClick: () => void
}

function TimelineEventItem({ event, isLast, isSelected, onClick }: TimelineEventItemProps) {
 const { t } = useTranslation()
 const time = new Date(event.timestamp)
 const timeAgo = formatDistanceToNow(time, { addSuffix: true, locale: zhCN })
 const timeStr = format(time, 'HH:mm:ss')

 const hasPayload = event.event_data && Object.keys(event.event_data).length > 0
 const isTaskEvent = ['task_started', 'task_completed', 'task_failed'].includes(event.event_type)
 const expertType = isTaskEvent ? String(event.event_data?.expert_type || '') : ''

 return (
  <div
   className={cn(
    'group relative -mx-2 flex cursor-pointer gap-4 rounded-md px-2 pb-6 transition-colors hover:bg-surface-tint/50',
    isSelected && 'bg-surface-tint'
   )}
   onClick={onClick}
  >
   {/* 时间线 */}
   {!isLast && (
    <div className="absolute left-4 top-10 h-full w-px bg-border-divider" />
   )}

   <EventIcon eventType={event.event_type} />

   {/* 内容 */}
   <div className="min-w-0 flex-1">
    <div className="flex items-center gap-2">
     {/* 专家归属：识别色点 + 名称（寻路语义） */}
     {expertType && (
      <span className="flex items-center gap-1.5 text-xs" style={{ color: expertColor(expertType) }}>
       <span className="h-2 w-2 rounded-full" style={{ backgroundColor: expertColor(expertType) }} />
       {expertDisplayName(expertType)}
      </span>
     )}
     <span className={cn('text-sm', expertType ? 'text-content-secondary' : 'font-medium text-content-primary')}>
      {getEventDisplayName(event.event_type)}
     </span>
     <span className="text-xs text-content-muted">{timeStr}</span>
     <span className="text-xs text-content-muted">({timeAgo})</span>

     {hasPayload && (
      <ChevronRight className={cn(
       'ml-auto h-4 w-4 text-content-muted',
       'opacity-0 transition-opacity group-hover:opacity-100',
       isSelected && 'opacity-100'
      )} />
     )}
    </div>

    {/* 事件详情 */}
    {event.event_data && Object.keys(event.event_data).length > 0 && (
     <div className="mt-1.5 text-sm text-content-secondary">
      {event.event_type === 'router_decided' && (
       <span>{t('modeLabel')} {event.event_data.mode === 'complex' ? t('modeComplex') : t('modeSimple')}</span>
      )}
      {event.event_type === 'task_completed' && (
       <span>{t('durationLabel')} {event.event_data.duration_ms ? `${Math.round(event.event_data.duration_ms as number / 1000)}s` : '-'}</span>
      )}
      {event.event_type === 'artifact_generated' && (
       <span>{t('artifactTypeLabel')} {String(event.event_data.artifact_type || 'unknown')}</span>
      )}
     </div>
    )}

    {event.note && (
     <p className="mt-1 text-sm text-content-secondary">{event.note}</p>
    )}
   </div>
  </div>
 )
}

// ============================================
// 审批注意力行（等待裁决时的琥珀行动块）
// ============================================

function ApprovalRow({ threadId }: { threadId: string }) {
 const { t } = useTranslation()
 const navigate = useNavigate()
 return (
  <div className="mb-4 flex items-center gap-3 rounded-md border border-accent-warning/30 bg-accent-warning/10 px-4 py-3">
   <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-warning/20">
    <AlertCircle className="h-4 w-4 text-accent-warning" />
   </div>
   <div className="min-w-0 flex-1">
    <div className="text-sm font-bold text-content-primary">{t('hitlWaitingApproval')}</div>
    <div className="text-xs text-content-secondary">{t('tasksPendingConfirm')}</div>
   </div>
   <Button size="sm" onClick={() => navigate(`/workbench/${threadId}`)}>
    {t('goToDecide')}
    <ExternalLink className="ml-1 h-3.5 w-3.5" />
   </Button>
  </div>
 )
}

// ============================================
// 执行计划卡（thread 详情的 sub_tasks 投影）
// ============================================

function PlanCard({ threadId }: { threadId: string }) {
 const { t } = useTranslation()
 const { data: conversation } = useQuery({
  queryKey: ['workbench', 'threadPlan', threadId],
  queryFn: () => getConversation(threadId),
  enabled: !!threadId,
  staleTime: 30_000,
  retry: 1,
 })

 const subTasks = conversation?.execution_plan?.sub_tasks
 if (!subTasks?.length) return null

 return (
  <div className="rounded-md border-theme-card border-border-default bg-surface-card p-4">
   <div className="mb-3 flex items-center justify-between">
    <span className="text-xs font-bold text-content-secondary">
     {t('planCardTitle')}
    </span>
    <span className="text-nano text-content-muted">
     {t('planStepCount', { count: subTasks.length })}
    </span>
   </div>
   <ol className="m-0 list-decimal space-y-2 pl-4 text-sm">
    {subTasks.map(task => (
     <li key={task.id} className="text-content-secondary">
      <span className="flex items-center gap-1.5">
       <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: expertColor(task.expert_type) }}
       />
       <span className="text-content-primary">{task.task_description}</span>
      </span>
      {task.status && (
       <span className="ml-3 text-xs text-content-muted">
        {task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : '…'} {task.status}
       </span>
      )}
     </li>
    ))}
   </ol>
  </div>
 )
}

// ============================================
// 主页面
// ============================================

export default function RunTimelinePage() {
 const { runId } = useParams<{ runId: string }>()
 const navigate = useNavigate()
 const { t } = useTranslation()

 const [selectedEvent, setSelectedEvent] = useState<RunEvent | null>(null)
 const [isDrawerOpen, setIsDrawerOpen] = useState(false)

 const { data: runResponse, isLoading: isRunLoading, error: runError } = useRunDetails(runId || null)
 const run = runResponse

 // 实时性：run 活动期间 3s 轮询事件账本（append-only，重复拉取安全）
 const isActive = !!run && ACTIVE_RUN_STATUSES.includes(run.status as RunStatus)
 const { data: timelineResponse, isLoading: isTimelineLoading, error: timelineError } = useRunTimeline(runId || null, undefined, {
  refetchInterval: isActive ? 3_000 : false,
 })

 const isLoading = isRunLoading || isTimelineLoading
 const error = runError || timelineError
 const events = useMemo(() => timelineResponse?.events || [], [timelineResponse])

 const handleEventClick = useCallback((event: RunEvent) => {
  setSelectedEvent(event)
  setIsDrawerOpen(true)
 }, [])
 const handleCloseDrawer = useCallback(() => setIsDrawerOpen(false), [])

 // 运行时长
 const durationText = run?.started_at && run.completed_at
  ? `${differenceInSeconds(new Date(run.completed_at), new Date(run.started_at))}s`
  : run?.started_at
   ? `${differenceInSeconds(new Date(), new Date(run.started_at))}s`
   : null

 if (isLoading) {
  return (
   <div className="flex h-full flex-col">
    <div className="flex items-center gap-4 border-b border-border-divider px-6 py-4">
     <Skeleton className="h-4 w-20" />
     <Skeleton className="h-5 w-48" />
    </div>
    <div className="max-w-3xl space-y-4 p-6">
     {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} className="h-14 w-full" />
     ))}
    </div>
   </div>
  )
 }

 if (error || !run) {
  return (
   <div className="flex h-full flex-col items-center justify-center">
    <AlertCircle className="h-12 w-12 text-content-muted" />
    <p className="mt-4 text-content-primary">{t('runNotFound')}</p>
    <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
     {t('runBack')}
    </Button>
   </div>
  )
 }

 const isAwaiting = run.status === 'waiting_for_approval'
 const threadId = run.thread_id

 return (
  <div className="flex h-full min-h-0 flex-col">
   {/* 头部 */}
   <header className="flex shrink-0 items-center gap-4 border-b border-border-divider px-6 py-4">
    <Button variant="ghost" size="sm" onClick={() => navigate(threadId ? `/workbench/${threadId}` : '/workbench')}>
     <ArrowLeft className="mr-2 h-4 w-4" />
     {t('backToWorkbench')}
    </Button>
    <div className="flex-1">
     <h1 className="text-lg font-semibold text-content-primary">
      {t('taskControlTitle')}
      <span className="ml-2 text-sm text-content-secondary">
       #{runId?.slice(0, 8)}
      </span>
     </h1>
    </div>
    {/* 状态 chip（语义色：裁决琥珀 / 执行绿 / 终态灰红） */}
    <span
     className={cn(
      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      isAwaiting && 'bg-accent-warning/12 text-accent-warning',
      isActive && !isAwaiting && 'bg-status-online/12 text-status-online',
      !isActive && !isAwaiting && run.status === 'completed' && 'bg-status-online/12 text-status-online',
      !isActive && !isAwaiting && run.status !== 'completed' && 'bg-status-offline/12 text-status-offline'
     )}
    >
     {(isActive || isAwaiting) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
     {isAwaiting ? t('chipAwaiting') : isActive ? t('chipRunning') : run.status}
    </span>
    {durationText && (
     <span className="text-xs text-content-muted">{durationText}</span>
    )}
   </header>

   {/* 主体：时间线 + 右栏 */}
   <div className="flex min-h-0 flex-1">
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
     {isAwaiting && threadId && <ApprovalRow threadId={threadId} />}

     {events.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-12 text-content-secondary">
       <Clock className="mb-2 h-8 w-8 opacity-50" />
       <p>{t('noEvents')}</p>
      </div>
     ) : (
      <div className="max-w-2xl space-y-0">
       {events.map((event, index) => (
        <TimelineEventItem
         key={event.id}
         event={event}
         isLast={index === events.length - 1}
         isSelected={selectedEvent?.id === event.id}
         onClick={() => handleEventClick(event)}
        />
       ))}
      </div>
     )}
    </div>

    {/* 右栏：执行计划 + 关联产物 */}
    <div className="hidden w-[340px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border-divider bg-surface-card p-4 lg:flex">
     {threadId && <PlanCard threadId={threadId} />}
     {threadId && <RelatedArtifacts threadId={threadId} />}
    </div>
   </div>

   {/* Payload 抽屉 */}
   <PayloadDrawer
    event={selectedEvent}
    isOpen={isDrawerOpen}
    onClose={handleCloseDrawer}
   />
  </div>
 )
}

/** 关联产物（thread 投影，点击跳产物中心看全文） */
function RelatedArtifacts({ threadId }: { threadId: string }) {
 const { t } = useTranslation()
 const [viewerId, setViewerId] = useState<string | null>(null)
 const { data, isLoading } = useThreadArtifactsQuery(threadId)
 const artifacts = data?.items ?? []

 return (
  <div className="rounded-md border-theme-card border-border-default bg-surface-card p-4">
   <div className="mb-3 flex items-center justify-between">
    <span className="text-xs font-bold text-content-secondary">
     {t('relatedArtifacts')}
    </span>
    <span className="text-nano text-content-muted">{artifacts.length}</span>
   </div>
   {isLoading ? (
    <div className="space-y-2">
     <Skeleton className="h-6 w-full" />
     <Skeleton className="h-6 w-5/6" />
    </div>
   ) : artifacts.length === 0 ? (
    <p className="text-nano text-content-muted">{t('canvasEmpty')}</p>
   ) : (
    <div className="space-y-1.5">
     {artifacts.map(artifact => (
      <button
       key={artifact.id}
       onClick={() => setViewerId(artifact.id)}
       className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-tint/60"
      >
       <span
        className="rounded-full px-2 py-0.5 text-nano font-medium"
        style={artifactTypeChipStyle(artifact.type)}
       >
        {artifact.type}
       </span>
       <span className="min-w-0 flex-1 truncate text-xs text-content-primary">
        {artifact.title || artifact.type}
       </span>
       <ChevronRight className="h-3 w-3 shrink-0 text-content-muted" />
      </button>
     ))}
    </div>
   )}
   <ArtifactViewerModal artifactId={viewerId} onClose={() => setViewerId(null)} threadId={threadId} />
  </div>
 )
}
