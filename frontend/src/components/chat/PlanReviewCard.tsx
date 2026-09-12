/**
 * PlanReviewCard - HITL 计划审批入口（对话流内联行）
 *
 * [蓝本] 审批行 = 琥珀底时间线行（⚠ 圆标 + 标题 + 暂停说明 + 「查看并审核」胶囊），
 * 点击行内按钮或右侧光晕打开 PlanReviewModal 完成批准/修订/终止。
 * [v4 修订循环] 修订请求提交后进入修订中态（轮询 GET /runs/{id}/plan），
 * plan_version 大于本地值即 v(n+1) 就绪——更新 store、重新亮卡；
 * 修订失败如实提示并保留原计划可继续批准/终止/再修订。
 * [蓝本光晕] 右缘琥珀渐变条直达裁决。
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@/i18n'
import { resumeChat, type ResumeChatParams } from '@/services/chat'
import { getRunPlanStatus } from '@/services/run'
import { pushToast } from '@/components/ui/use-toast'
import { PlanReviewModal } from '@/components/chat/PlanReviewModal'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import type { TaskInfo } from '@/types/events'

import {
  useIsWaitingForApproval,
  usePendingPlan,
  usePendingRunId,
  usePendingPlanVersion,
  usePlanRevising,
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
  const planRevising = usePlanRevising()
  const { clearPendingPlan, setIsWaitingForApproval, setPlanRevising, setPendingPlan, updateTasksFromPlan, setMode } = useTaskActions()
  const addMessage = useAddMessageAction()

  const [modalOpen, setModalOpen] = useState(false)
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ===== 修订轮询：planRevising 期间每 3s 拉计划状态 =====
  const planQuery = useQuery({
    queryKey: ['planStatus', pendingRunId],
    queryFn: () => getRunPlanStatus(pendingRunId!),
    enabled: !!pendingRunId && planRevising,
    refetchInterval: 3000,
  })

  const handledVersionRef = useRef<number | null>(null)
  useEffect(() => {
    if (!planRevising) return
    const data = planQuery.data
    if (!data) return

    if (data.revising) return // 仍在修订中

    if (data.revision_error) {
      // 修订失败：保留原计划待审，可重试修订或直接批准/终止
      setPlanRevising(false)
      pushToast({ title: t('revisionFailed'), description: data.revision_error, variant: 'destructive' })
      return
    }

    if (
      data.plan_version > (pendingPlanVersion ?? 0) &&
      data.tasks.length > 0 &&
      handledVersionRef.current !== data.plan_version
    ) {
      handledVersionRef.current = data.plan_version
      setPendingPlan(
        data.tasks.map(task => ({
          id: task.id,
          expert_type: task.expert_type,
          description: task.description,
          sort_order: task.sort_order,
          status: 'pending' as const,
          depends_on: task.depends_on,
          artifacts: [],
        })),
        data.plan_version,
        pendingRunId,
        data.plan_id,
      )
      setPlanRevising(false)
      pushToast({ title: t('planRevisedToast', { version: data.plan_version }) })
    }
  }, [planRevising, planQuery.data, pendingPlanVersion, pendingRunId, setPendingPlan, setPlanRevising, t])

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

  const handleRevise = useCallback(async (feedback: string) => {
    if (!feedback) {
      pushToast({ title: t('reviseNeedFeedback'), variant: 'destructive' })
      return
    }
    if (!pendingRunId) {
      pushToast({ title: '缺少运行实例 ID', description: '无法提交修订', variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      // 非流式 JSON：{"status": "revising", "execution_plan_id": ...}
      // 修订由后端后台任务执行；本卡轮询感知 v(n+1)
      await resumeChat(
        {
          threadId,
          runId: pendingRunId,
          planVersion: pendingPlanVersion,
          approved: false,
          action: 'revise',
          feedback,
        },
        undefined
      )
      setPlanRevising(true)
      setModalOpen(false)
      addMessage({
        role: 'system',
        content: t('planRevisionSubmitted'),
        timestamp: Date.now(),
      })
    } catch (error) {
      // 失败必须恢复审批卡（run 仍处于等待审批）
      if (!isAbortError(error)) {
        pushToast({ title: (error as Error).message || t('revisionFailed'), variant: 'destructive' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [threadId, pendingPlanVersion, pendingRunId, setPlanRevising, addMessage, t])

  const handleTerminate = useCallback(async () => {
    if (!pendingRunId) {
      pushToast({ title: '缺少运行实例 ID', description: '无法终止当前任务', variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    clearPendingPlan()
    setPlanRevising(false)
    setIsWaitingForApproval(false)
    setMode('simple')

    try {
      // 终止走非流式 JSON 路径（后端返回 JSON，非 SSE 流）
      await resumeChat(
        {
          threadId,
          runId: pendingRunId,
          planVersion: pendingPlanVersion,
          approved: false,
          action: 'terminate',
        },
        undefined
      )
      addMessage({
        role: 'system',
        content: t('planRejectedMsg'),
        timestamp: Date.now(),
      })
    } catch (error) {
      // 终止失败同样必须恢复审批卡片（后端 run 未取消，仍等待审批）
      setIsWaitingForApproval(true)
      swallowAbort(error)
    } finally {
      setIsSubmitting(false)
    }
  }, [threadId, pendingPlanVersion, pendingRunId, clearPendingPlan, setIsWaitingForApproval, setPlanRevising, setMode, addMessage, t, swallowAbort])

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
            background: 'linear-gradient(to bottom, transparent, rgb(180 83 9 / 0.55) 30%, rgb(180 83 9 / 0.55) 70%, transparent)',
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
            {planRevising ? (
              <>
                <div className="flex items-center gap-2 text-[13px] font-bold text-content-primary">
                  {t('revisingTitle')}
                  <span className="shimmer" />
                </div>
                <div className="mt-0.5 text-[11.5px] text-content-muted">{t('revisingHint')}</div>
              </>
            ) : (
              <>
                <div className="text-[13px] font-bold text-content-primary">
                  {t('planReviewTitle')} · {t('tasksPendingConfirm', { count: pendingPlan.length })}
                </div>
                <div className="mt-0.5 text-[11.5px] text-content-muted">{t('planReviewPaused')}</div>
              </>
            )}
          </div>
          <button
            onClick={() => setModalOpen(true)}
            disabled={isSubmitting || planRevising}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-accent-warning/35 bg-surface-card px-3 text-xs font-medium text-accent-warning transition-all hover:-translate-y-px hover:shadow-theme-card disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {planRevising ? t('revisingTitle') : t('planReviewViewBtn')}
          </button>
        </div>
      </div>

      <PlanReviewModal
        open={modalOpen}
        plan={pendingPlan}
        planVersion={pendingPlanVersion}
        isSubmitting={isSubmitting}
        isRevising={planRevising}
        onApprove={handleApprove}
        onRevise={handleRevise}
        onTerminate={() => {
          setModalOpen(false)
          setShowTerminateConfirm(true)
        }}
        onClose={() => setModalOpen(false)}
      />

      <DeleteConfirmDialog
        isOpen={showTerminateConfirm}
        onClose={() => setShowTerminateConfirm(false)}
        onConfirm={handleTerminate}
        title={t('terminateTask')}
        description={t('terminateTaskWarning')}
        confirmText={isSubmitting ? t('canceling') : t('terminateTask')}
        isDeleting={isSubmitting}
        variant="danger"
      />
    </>
  )
}

export default PlanReviewCard
