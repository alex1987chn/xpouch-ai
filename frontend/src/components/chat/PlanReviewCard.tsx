/**
 * PlanReviewCard - HITL 计划审批入口（对话流内联行）
 *
 * [蓝本] 审批行 = 琥珀底时间线行（⚠ 圆标 + 标题 + 暂停说明 + 「查看并裁决」胶囊），
 * 点击行内按钮或右侧光晕打开 PlanReviewModal 大弹窗完成批准/驳回。
 * 批准/驳回的业务逻辑（resume 流、计划版本冲突恢复）原样保留在本组件。
 */

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { resumeChat, type ResumeChatParams } from '@/services/chat'
import { pushToast } from '@/components/ui/use-toast'
import { PlanReviewModal } from '@/components/chat/PlanReviewModal'
import type { TaskInfo } from '@/types/events'

import {
  useIsWaitingForApproval,
  usePendingPlan,
  usePendingRunId,
  usePendingPlanVersion,
  useTaskActions,
} from '@/hooks/useTaskSelectors'
import { useAddMessageAction } from '@/hooks/useChatSelectors'

interface PlanReviewCardProps {
  threadId: string
  resumeExecution: (params: ResumeChatParams) => Promise<string>
}

function isPlanVersionConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { status?: number; code?: string; message?: string }
  const code = maybeError.code || ''
  const message = maybeError.message || ''
  return (
    maybeError.status === 409 ||
    code === 'PLAN_VERSION_CONFLICT' ||
    message.includes('PLAN_VERSION_CONFLICT')
  )
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if (error instanceof Error) {
    const name = error.name?.toLowerCase() || ''
    const message = error.message?.toLowerCase() || ''
    return (
      name === 'aborterror' ||
      message.includes('abort') ||
      message.includes('cancel') ||
      message.includes('取消')
    )
  }
  return false
}

export function PlanReviewCard({ threadId, resumeExecution }: PlanReviewCardProps) {
  const { t } = useTranslation()
  const isWaitingForApproval = useIsWaitingForApproval()
  const pendingPlan = usePendingPlan()
  const pendingRunId = usePendingRunId()
  const pendingPlanVersion = usePendingPlanVersion()
  const { clearPendingPlan, setIsWaitingForApproval, updateTasksFromPlan, setMode } = useTaskActions()
  const addMessage = useAddMessageAction()

  const [modalOpen, setModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 导航离开导致的取消，不显示错误
  const swallowAbort = useCallback((error: unknown) => {
    if (!isAbortError(error)) {
      pushToast({ title: t('resumeFailed'), variant: 'destructive' })
    }
  }, [t])

  const handleApprove = useCallback(async (plan: TaskInfo[]) => {
    if (plan.length === 0) {
      pushToast({ title: t('minOneTask'), variant: 'destructive' })
      return
    }
    if (!pendingRunId) {
      pushToast({ title: '缺少运行实例 ID', description: '无法恢复执行', variant: 'destructive' })
      return
    }

    const tempMessageId = `temp-resume-${Date.now()}`
    setIsSubmitting(true)
    setMode('complex')
    updateTasksFromPlan(plan)
    setIsWaitingForApproval(false)

    addMessage({
      id: tempMessageId,
      role: 'system',
      content: t('planApprovedMsg'),
      timestamp: Date.now(),
    })

    try {
      await resumeExecution({
        threadId,
        runId: pendingRunId,
        planVersion: pendingPlanVersion,
        updatedPlan: plan.map((task, index) => ({
          id: task.id,
          expert_type: task.expert_type,
          description: task.description,
          sort_order: index,
          status: task.status,
          depends_on: task.depends_on || [],
        })),
        approved: true,
      })
    } catch (error) {
      // 任何失败（含中断/重复请求）都必须恢复审批卡片：
      // 后端 run 仍处于 waiting_for_approval，卡片丢失 = 用户被永久卡在"恢复中"
      setIsWaitingForApproval(true)
      if (isAbortError(error)) {
        return
      }
      const userMessage = isPlanVersionConflictError(error)
        ? t('planConflictMsg')
        : error instanceof Error && error.message
          ? `${t('resumeFailed')}: ${error.message}`
          : t('resumeFailed')
      addMessage({ id: tempMessageId, role: 'system', content: userMessage, timestamp: Date.now() })
      pushToast({ title: userMessage, variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }, [threadId, pendingPlanVersion, pendingRunId, resumeExecution, updateTasksFromPlan, setIsWaitingForApproval, addMessage, setMode, t])

  const handleReject = useCallback(async (feedback: string) => {
    if (!pendingRunId) {
      pushToast({ title: '缺少运行实例 ID', description: '无法取消当前计划', variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    clearPendingPlan()
    setIsWaitingForApproval(false)
    setMode('simple')

    try {
      // 取消走非流式 JSON 路径（后端 _handle_rejection 返回 JSON，非 SSE 流）；
      // 反馈随请求提交，后端落库为会话 user 消息
      await resumeChat(
        {
          threadId,
          runId: pendingRunId,
          planVersion: pendingPlanVersion,
          approved: false,
          feedback: feedback || undefined,
        },
        undefined
      )
      addMessage({
        role: 'system',
        content: feedback ? `${t('planRejectedWithFeedback')}：${feedback}` : t('planRejectedMsg'),
        timestamp: Date.now(),
      })
    } catch (error) {
      // 取消失败同样必须恢复审批卡片（后端 run 未取消，仍等待审批）
      setIsWaitingForApproval(true)
      swallowAbort(error)
    } finally {
      setIsSubmitting(false)
    }
  }, [threadId, pendingPlanVersion, pendingRunId, clearPendingPlan, setIsWaitingForApproval, setMode, addMessage, t, swallowAbort])

  if (!isWaitingForApproval) return null

  return (
    <>
      {/* 蓝本审批光晕：右缘琥珀渐变条，点击直达裁决 */}
      {createPortal(
        <button
          onClick={() => setModalOpen(true)}
          title={t('planReviewViewBtn')}
          className="fixed right-0 top-[52px] bottom-[28px] hidden w-[7px] cursor-pointer xl:block"
          style={{
            zIndex: 30,
            background: 'linear-gradient(to bottom, transparent, rgba(180,95,6,.55) 30%, rgba(180,95,6,.55) 70%, transparent)',
            filter: 'blur(1px)',
          }}
        />,
        document.body
      )}

      {/* 内联审批行（蓝本 appraisal 时间线行） */}
      <div className="my-4 rounded-lg border border-accent-warning/25 bg-accent-warning/[0.08] p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-warning/15 text-accent-warning">
            <AlertTriangle className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-content-primary">
              {t('planReviewTitle')} · {t('tasksPendingConfirm', { count: pendingPlan.length })}
            </div>
            <div className="mt-0.5 text-[11.5px] text-content-muted">{t('planReviewPaused')}</div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            disabled={isSubmitting}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-accent-warning/35 bg-surface-card px-3 text-xs font-medium text-accent-warning transition-all hover:-translate-y-px hover:shadow-theme-card disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {t('planReviewViewBtn')}
          </button>
        </div>
      </div>

      <PlanReviewModal
        open={modalOpen}
        plan={pendingPlan}
        planVersion={pendingPlanVersion}
        isSubmitting={isSubmitting}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={() => setModalOpen(false)}
      />
    </>
  )
}

export default PlanReviewCard
