/**
 * PlanReviewCard - HITL (Human-in-the-Loop) 计划审核组件
 * 
 * v3.3 视觉优化：
 * - 统一使用 border 而非背景色区分层次
 * - 简化专家标签为单色标签
 * - 减少动画，提升响应感
 * - 更克制的配色方案
 */

import { useState, useCallback } from 'react'
import { Trash2, Edit3, CheckCircle2, XCircle, Play, Loader2, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { ResumeChatParams } from '@/services/chat'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'

import {
  useIsWaitingForApproval,
  usePendingPlan,
  usePendingPlanVersion,
  useTaskActions,
} from '@/hooks/useTaskSelectors'
import { useAddMessageAction } from '@/hooks/useChatSelectors'
import { cn } from '@/lib/utils'

interface PlanReviewCardProps {
  conversationId: string
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

export function PlanReviewCard({ conversationId, resumeExecution }: PlanReviewCardProps) {
  const { t } = useTranslation()
  const isWaitingForApproval = useIsWaitingForApproval()
  const pendingPlan = usePendingPlan()
  const pendingPlanVersion = usePendingPlanVersion()
  const { clearPendingPlan, setIsWaitingForApproval, updateTasksFromPlan, setMode } = useTaskActions()
  const addMessage = useAddMessageAction()

  const [editedPlan, setEditedPlan] = useState(pendingPlan)
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const handleUpdateDescription = useCallback((taskId: string, newDescription: string) => {
    setEditedPlan(prev =>
      prev.map(task => (task.id === taskId ? { ...task, description: newDescription } : task))
    )
  }, [])

  const handleDeleteTask = useCallback((taskId: string) => {
    setEditedPlan(prev => prev.filter(task => task.id !== taskId))
  }, [])

  const handleReject = useCallback(() => setShowConfirmDialog(true), [])

  const doCancel = useCallback(async () => {
    setShowConfirmDialog(false)
    setIsCancelling(true)
    setIsSubmitting(true)

    clearPendingPlan()
    setIsWaitingForApproval(false)
    setMode('simple')

    try {
      await resumeExecution({ threadId: conversationId, planVersion: pendingPlanVersion, approved: false })
      addMessage({ role: 'system', content: '计划已取消，状态已清理', timestamp: Date.now() })
    } catch {
      setIsWaitingForApproval(true)
      alert('取消失败，请重试')
    } finally {
      setIsSubmitting(false)
      setIsCancelling(false)
    }
  }, [conversationId, pendingPlanVersion, resumeExecution, clearPendingPlan, setIsWaitingForApproval, setMode, addMessage])

  const handleApprove = useCallback(async () => {
    if (editedPlan.length === 0) {
      alert(t('minOneTask'))
      return
    }

    const tempMessageId = `temp-resume-${Date.now()}`
    setIsSubmitting(true)
    setMode('complex')
    updateTasksFromPlan(editedPlan)
    setIsWaitingForApproval(false)

    addMessage({
      id: tempMessageId,
      role: 'system',
      content: '计划已确认，正在恢复执行...',
      timestamp: Date.now(),
    })

    try {
      await resumeExecution({
        threadId: conversationId,
        planVersion: pendingPlanVersion,
        updatedPlan: editedPlan.map((task, index) => ({
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
      setIsWaitingForApproval(true)
      const userMessage = isPlanVersionConflictError(error)
        ? '计划已被其他操作更新，请刷新后重新确认'
        : '启动失败，请检查网络后重试'
      addMessage({ id: tempMessageId, role: 'system', content: userMessage, timestamp: Date.now() })
      alert(userMessage)
    } finally {
      setIsSubmitting(false)
    }
  }, [editedPlan, conversationId, pendingPlanVersion, resumeExecution, updateTasksFromPlan, setIsWaitingForApproval, addMessage, setMode, t])

  if (!isWaitingForApproval) return null

  return (
    <div className="my-4 border-2 border-border-default bg-surface-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default bg-surface-elevated">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-content-secondary" />
          <div>
            <h3 className="text-sm font-semibold text-content-primary">计划审核</h3>
            <span className="text-xs text-content-muted">{editedPlan.length} 个任务待确认</span>
          </div>
        </div>
        <span className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-border-default text-content-muted">
          HITL
        </span>
      </div>

      {/* Task List */}
      <div className="p-4 space-y-3 max-h-72 overflow-y-auto bauhaus-scrollbar">
        {editedPlan.map((task, index) => (
          <div
            key={task.id}
            className="group border border-border-default hover:border-border-hover transition-colors"
          >
            <div className="flex items-start gap-3 p-3">
              {/* Index */}
              <span className="text-xs font-mono text-content-muted pt-0.5">{index + 1}</span>

              <div className="flex-1 min-w-0 space-y-2">
                {/* Expert Tag */}
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide border border-border-default text-content-secondary">
                  {task.expert_type}
                </span>

                {/* Description */}
                {isEditing ? (
                  <textarea
                    value={task.description}
                    onChange={e => handleUpdateDescription(task.id, e.target.value)}
                    className="w-full p-2 text-sm border border-border-default bg-surface-card text-content-primary focus:outline-none focus:border-content-primary resize-none"
                    rows={2}
                  />
                ) : (
                  <p className="text-sm text-content-secondary leading-relaxed">{task.description}</p>
                )}
              </div>

              {/* Delete Button */}
              {isEditing && editedPlan.length > 1 && (
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="p-1.5 text-status-offline hover:bg-status-offline/10 transition-colors"
                  title={t('deleteTask')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t-2 border-border-default bg-surface-elevated">
        <button
          onClick={() => setIsEditing(!isEditing)}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border-default',
            'bg-surface-card text-content-secondary hover:bg-surface-page',
            'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          )}
        >
          {isEditing ? <CheckCircle2 className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
          {isEditing ? '完成' : '编辑'}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReject}
            disabled={isSubmitting}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-xs font-medium border',
              'border-status-offline text-status-offline hover:bg-status-offline/5',
              'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            )}
          >
            <XCircle className="w-4 h-4" />
            取消
          </button>

          <button
            onClick={handleApprove}
            disabled={isSubmitting || editedPlan.length === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-xs font-medium',
              'bg-content-primary text-surface-card hover:bg-content-secondary',
              'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                执行中
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                确认执行
              </>
            )}
          </button>
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={doCancel}
        title={t('confirmCancelTitle')}
        description={t('confirmCancelDescription')}
        confirmText={isCancelling ? t('canceling') : t('confirmCancel')}
        isDeleting={isCancelling}
        variant="warning"
      />
    </div>
  )
}

export default PlanReviewCard
