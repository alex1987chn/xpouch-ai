/**
 * PlanReviewModal - HITL 计划审批大弹窗
 *
 * [蓝本] 审批模态：计划步骤（序号圆 + 专家点）+ 批准执行（黄胶囊）/ 驳回（幽灵）。
 * 驳回 → 反馈视图：反馈文本随 approved=false 提交，后端落库为会话 user 消息。
 * 计划编辑能力保留：编辑模式下可改任务描述 / 删除任务（至少保留一个）。
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import { Z_INDEX } from '@/constants/zIndex'
import { expertColor } from '@/lib/expertIdentity'
import { cn } from '@/lib/utils'
import type { TaskInfo } from '@/types/events'

interface PlanReviewModalProps {
  open: boolean
  plan: TaskInfo[]
  planVersion: number | null
  isSubmitting: boolean
  onApprove: (plan: TaskInfo[]) => void
  onReject: (feedback: string) => void
  onClose: () => void
}

export function PlanReviewModal({
  open, plan, planVersion, isSubmitting, onApprove, onReject, onClose,
}: PlanReviewModalProps) {
  const { t } = useTranslation()
  const [editedPlan, setEditedPlan] = useState<TaskInfo[]>(plan)
  const [isEditing, setIsEditing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [feedback, setFeedback] = useState('')

  // 每次打开时以最新待审计划复位
  useEffect(() => {
    if (open) {
      setEditedPlan(plan)
      setIsEditing(false)
      setRejecting(false)
      setFeedback('')
    }
  }, [open, plan])

  useEscapeToClose(open && !isSubmitting, onClose)
  const a11y = useDialogA11y<HTMLDivElement>(open, 'plan-review-modal-title')

  if (!open) return null

  const ghostBtn = 'flex h-9 items-center gap-1.5 rounded-full border border-border-divider bg-surface-card px-4 text-[13px] font-medium text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50'
  const primaryBtn = 'flex h-9 items-center gap-1.5 rounded-full border border-border-divider bg-accent-brand px-5 text-[13px] font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none'

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      style={{ zIndex: Z_INDEX.MODAL }}
      onMouseDown={e => { if (e.target === e.currentTarget && !isSubmitting) onClose() }}
    >
      <div
        {...a11y}
        aria-labelledby="plan-review-modal-title"
        className="max-h-[82vh] w-[min(580px,94vw)] overflow-y-auto rounded-xl border border-border-default bg-surface-card shadow-theme-modal"
      >
        {/* 头部 */}
        <div className="flex items-center gap-2.5 border-b border-border-divider px-5 py-4">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent-warning/15 text-accent-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <span id="plan-review-modal-title" className="flex-1 text-[14.5px] font-bold text-content-primary">
            {t('planReviewTitle')}
          </span>
          {planVersion != null && (
            <span className="text-nano text-content-muted">{t('planVersionMeta', { version: planVersion })}</span>
          )}
        </div>

        {/* 计划视图 */}
        {!rejecting ? (
          <>
            <div className="flex flex-col gap-3 px-5 py-4">
              <p className="text-[12.5px] leading-relaxed text-content-secondary">{t('approvalModalNote')}</p>
              <div className="flex flex-col gap-2">
                {editedPlan.map((task, index) => (
                  <div key={task.id} className="flex gap-3 rounded-md border border-border-divider bg-surface-page p-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-tint font-display text-[11px] font-bold text-content-secondary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <textarea
                          value={task.description}
                          onChange={e => setEditedPlan(prev =>
                            prev.map(p => (p.id === task.id ? { ...p, description: e.target.value } : p))
                          )}
                          rows={2}
                          className="w-full resize-none rounded-md border border-border-default bg-surface-card p-2 text-[13px] text-content-primary focus:border-border-focus focus:outline-none"
                        />
                      ) : (
                        <p className="text-[13px] leading-relaxed text-content-primary">{task.description}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-content-muted">
                        <span className="h-[7px] w-[7px] rounded-full" style={expertDotStyle(task.expert_type)} />
                        {t('planStepExecutor', { expert: task.expert_type })}
                      </div>
                    </div>
                    {isEditing && editedPlan.length > 1 && (
                      <button
                        onClick={() => setEditedPlan(prev => prev.filter(p => p.id !== task.id))}
                        title={t('deleteTask')}
                        className="mt-0.5 h-6 w-6 shrink-0 text-status-offline transition-colors hover:opacity-80"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* 底部：编辑 / 驳回 / 批准 */}
            <div className="flex items-center gap-2.5 border-t border-border-divider px-5 py-3.5">
              <button
                onClick={() => setIsEditing(v => !v)}
                disabled={isSubmitting}
                className={cn(ghostBtn, 'mr-auto')}
              >
                {isEditing ? t('finishEdit') : t('editPlan')}
              </button>
              <button onClick={() => setRejecting(true)} disabled={isSubmitting} className={ghostBtn}>
                {t('rejectPlan')}
              </button>
              <button
                onClick={() => onApprove(editedPlan)}
                disabled={isSubmitting || editedPlan.length === 0}
                className={primaryBtn}
              >
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('approveRun')}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 驳回反馈视图 */}
            <div className="flex flex-col gap-3 px-5 py-4">
              <p className="text-[12.5px] leading-relaxed text-content-secondary">
                <b className="text-content-primary">{t('feedbackTitle')}</b>
                {' · '}{t('feedbackNote')}
              </p>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                autoFocus
                rows={4}
                placeholder={t('feedbackPlaceholder')}
                className="w-full resize-y rounded-md border border-border-default bg-surface-page p-3 text-[13px] leading-relaxed text-content-primary placeholder:text-content-muted focus:border-border-focus focus:outline-none"
              />
              <p className="text-[11.5px] text-content-muted">{t('feedbackHint')}</p>
            </div>
            <div className="flex items-center justify-end gap-2.5 border-t border-border-divider px-5 py-3.5">
              <button onClick={() => setRejecting(false)} disabled={isSubmitting} className={ghostBtn}>
                {t('cancel')}
              </button>
              <button
                onClick={() => onReject(feedback.trim())}
                disabled={isSubmitting}
                className={primaryBtn}
              >
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('confirmReject')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

/** 专家识别色点样式（低饱和底 + 深字同族） */
function expertDotStyle(expertType: string): React.CSSProperties {
  const color = expertColor(expertType)
  return { backgroundColor: color }
}

export default PlanReviewModal
