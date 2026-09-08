/**
 * Run Timeline Page
 *
 * 独立的时间线查看页面，展示运行实例的完整事件历史
 *
 * [路由] /run/:runId
 * [入口] 从对话页面顶部 run_id 链接跳转
 */

import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, AlertCircle, CheckCircle, Loader2, ChevronRight } from 'lucide-react'
import { format, formatDistanceToNow, differenceInSeconds } from 'date-fns'
import { useTranslation } from '@/i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { zhCN } from 'date-fns/locale'
import { useState, useCallback } from 'react'

import { useRunDetails, useRunTimeline } from '@/hooks/queries/useRunTimelineQuery'
import type { RunEvent, RunEventType } from '@/types/run'
import { getEventDisplayName, getEventCategory } from '@/types/run'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { PayloadDrawer } from './PayloadDrawer'
import { RunStatusBadge } from '@/components/ui/run-status-badge'

// ============================================
// 事件图标组件
// ============================================

const eventIconConfig: Record<string, { icon: typeof Clock; color: string }> = {
  lifecycle: { icon: Clock, color: 'text-blue-500' },
  router: { icon: Clock, color: 'text-purple-500' },
  plan: { icon: Clock, color: 'text-indigo-500' },
  hitl: { icon: AlertCircle, color: 'text-yellow-500' },
  task: { icon: Loader2, color: 'text-accent-primary' },
  artifact: { icon: CheckCircle, color: 'text-green-500' },
  other: { icon: Clock, color: 'text-content-secondary' },
}

function EventIcon({ eventType }: { eventType: RunEventType }) {
  const category = getEventCategory(eventType)
  const config = eventIconConfig[category] || eventIconConfig.other
  const Icon = config.icon

  // 终态事件使用不同颜色
  const isTerminal = ['run_completed', 'run_failed', 'run_cancelled', 'run_timed_out'].includes(eventType)
  const isFailed = ['run_failed', 'run_cancelled', 'run_timed_out', 'task_failed', 'hitl_rejected'].includes(eventType)

  const finalColor = isFailed ? 'text-red-500' : isTerminal ? 'text-green-500' : config.color

  return (
    <div className={cn(
      'flex h-8 w-8 items-center justify-center rounded-full border-2 bg-surface-card',
      finalColor.replace('text-', 'border-')
    )}>
      <Icon className={cn('h-4 w-4', finalColor)} />
    </div>
  )
}

// ============================================
// 时间线事件组件
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

  return (
    <div
      className={cn(
        'relative flex gap-4 pb-6 cursor-pointer group',
        isSelected && 'bg-accent-subtle/50 -mx-2 px-2 rounded'
      )}
      onClick={onClick}
    >
      {/* 时间线 */}
      {!isLast && (
        <div className="absolute left-4 top-10 h-full w-0.5 bg-border-default" />
      )}

      {/* 图标 */}
      <EventIcon eventType={event.event_type} />

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-content-primary">
            {getEventDisplayName(event.event_type)}
          </span>
          <span className="text-xs text-content-tertiary">{timeStr}</span>
          <span className="text-xs text-content-tertiary">({timeAgo})</span>
          
          {/* Payload 指示器 */}
          {hasPayload && (
            <ChevronRight className={cn(
              'h-4 w-4 text-content-tertiary ml-auto',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              isSelected && 'opacity-100'
            )} />
          )}
        </div>

        {/* 事件详情 */}
        {event.event_data && Object.keys(event.event_data).length > 0 && (
          <div className="mt-2 text-sm text-content-secondary">
            {event.event_type === 'router_decided' && (
              <span>{t('modeLabel')} {event.event_data.mode === 'complex' ? t('modeComplex') : t('modeSimple')}</span>
            )}
            {event.event_type === 'task_started' && (
              <span>{t('expertLabel')} {String(event.event_data.expert_type || 'unknown')}</span>
            )}
            {event.event_type === 'task_completed' && (
              <span>{t('durationLabel')} {event.event_data.duration_ms ? `${Math.round(event.event_data.duration_ms as number / 1000)}s` : '-'}</span>
            )}
            {event.event_type === 'artifact_generated' && (
              <span>{t('artifactTypeLabel')} {String(event.event_data.artifact_type || 'unknown')}</span>
            )}
            {event.event_type === 'hitl_interrupted' && (
              <span>{t('hitlWaitingApproval')}</span>
            )}
          </div>
        )}

        {/* note */}
        {event.note && (
          <p className="mt-1 text-sm text-content-secondary">{event.note}</p>
        )}
      </div>
    </div>
  )
}

// ============================================
// 运行信息卡片
// ============================================

function RunInfoCard({ run }: { run: NonNullable<ReturnType<typeof useRunDetails>['data']> }) {
  const { t } = useTranslation()
  const duration = run.completed_at && run.started_at
    ? differenceInSeconds(new Date(run.completed_at), new Date(run.started_at))
    : null

  return (
    <div className="border-b border-border-default bg-surface-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <RunStatusBadge status={run.status} variant="detailed" />
          <span className="text-sm text-content-secondary">
            {t('modeLabel')} {run.mode === 'complex' ? t('modeComplexShort') : t('modeSimpleShort')}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-content-secondary">
          {duration !== null && (
            <span>{t('durationLabel')} {duration}s</span>
          )}
          {run.created_at && (
            <span>{t('runCreatedAt', { time: format(new Date(run.created_at), 'yyyy-MM-dd HH:mm') })}</span>
          )}
        </div>
      </div>

      {/* 错误信息 */}
      {run.error_message && (
        <div className="mt-3 rounded-md bg-status-offline/10 p-3">
          <p className="text-sm text-status-offline">
            错误: {run.error_message}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================
// 主页面组件
// ============================================

export default function RunTimelinePage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  // 抽屉状态
  const [selectedEvent, setSelectedEvent] = useState<RunEvent | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const { data: runResponse, isLoading: isRunLoading, error: runError } = useRunDetails(runId || null)
  const { data: timelineResponse, isLoading: isTimelineLoading, error: timelineError } = useRunTimeline(runId || null)

  const isLoading = isRunLoading || isTimelineLoading
  const error = runError || timelineError
  const run = runResponse
  const events = timelineResponse?.events || []

  // 点击事件
  const handleEventClick = useCallback((event: RunEvent) => {
    setSelectedEvent(event)
    setIsDrawerOpen(true)
  }, [])

  // 关闭抽屉
  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false)
  }, [])

  // 加载状态（与下方时间线布局同构：头部条 + 事件行）
  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b border-border-default px-6 py-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="p-6 space-y-4 max-w-3xl">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    )
  }

  // 错误状态
  if (error || !run) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-content-tertiary" />
        <p className="mt-4 text-content-primary">{t('runNotFound')}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          {t('runBack')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <header className="flex items-center gap-4 border-b border-border-default px-6 py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('runBack')}
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-content-primary">
            {t('runDetails')}
            <span className="ml-2 font-mono text-sm text-content-secondary">
              #{runId?.slice(0, 8)}
            </span>
          </h1>
        </div>
      </header>

      {/* 运行信息 */}
      <RunInfoCard run={run} />

      {/* 时间线 */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-content-secondary">
              <Clock className="h-8 w-8 mb-2 opacity-50" />
              <p>{t('noEvents')}</p>
            </div>
          ) : (
            <div className="space-y-0">
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
      </ScrollArea>

      {/* Payload 抽屉 */}
      <PayloadDrawer
        event={selectedEvent}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </div>
  )
}
