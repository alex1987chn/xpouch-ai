/**
 * PlanReviewModal - HITL 计划审批大弹窗
 *
 * [三动作] 批准执行（黄胶囊）/ 修订并重提（驳回+反馈 → 专家出 v(n+1)，
 * 任务保持挂起）/ 终止任务（现取消语义，反馈照样落库留痕）。
 * [修订中] isRevising 时计划区替换为"专家修订中"面板（微光条），弹窗可关闭，
 * 修订由后台任务执行，PlanReviewCard 轮询感知 v(n+1) 后重新亮卡。
 * 计划编辑能力保留：编辑模式下可改任务描述 / 删除任务（至少保留一个）。
 */

import { useState, useEffect } from 'react'
import { AlertTriangle, Trash2, Loader2, X } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { ModalShell } from '@/components/ui/modal-shell'
import { expertDotStyle } from '@/lib/expertIdentity'
import { cn } from '@/lib/utils'
import type { TaskInfo } from '@/types/events'

interface PlanReviewModalProps {
  open: boolean
  plan: TaskInfo[]
  planVersion: number | null
  isSubmitting: boolean
  isRevising: boolean
  onApprove: (plan: TaskInfo[]) => void
  onRevise: (feedback: string) => void
  onTerminate: () => void
  onClose: () => void
}

export function PlanReviewModal({
  open, plan, planVersion, isSubmitting, isRevising, onApprove, onRevise, onTerminate, onClose,
}: PlanReviewModalProps) {
  const { t } = useTranslation()
  const [editedPlan, setEditedPlan] = useState<TaskInfo[]>(plan)
  const [isEditing, setIsEditing] = useState(false)
  const [feedbackView, setFeedbackView] = useState(false)
  const [feedback, setFeedback] = useState('')

  // 每次打开时以最新待审计划复位
  useEffect(() => {
    if (open) {
      setEditedPlan(plan)
      setIsEditing(false)
      setFeedbackView(false)
      setFeedback('')
    }
  }, [open, plan])

  const ghostBtn = 'flex h-9 items-center gap-1.5 rounded-full border border-border-divider bg-surface-card px-4 text-[13px] font-medium text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50'
  const primaryBtn = 'flex h-9 items-center gap-1.5 rounded-full border border-border-divider bg-accent-brand px-5 text-[13px] font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none'
  const dangerBtn = 'flex h-9 items-center gap-1.5 rounded-full border border-status-offline/40 bg-surface-card px-4 text-[13px] font-medium text-status-offline transition-colors hover:bg-status-offline/5 disabled:opacity-50'

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy="plan-review-modal-title"
      dismissable={!isSubmitting && !isRevising}
      panelClassName="max-h-[82vh] w-[min(580px,94vw)] overflow-y-auto"
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
        <button
          onClick={onClose}
          title={t('close')}
          disabled={isSubmitting}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-content-secondary transition-colors hover:bg-surface-tint hover:text-content-primary disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isRevising ? (
        /* 修订中面板：后台任务执行中，弹窗可关闭，轮询感知 v(n+1) */
        <>
          <div className="flex flex-col gap-3 px-5 py-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-brand/15">
                <Loader2 className="h-3 w-3 animate-spin text-accent-brand" />
              </span>
              <span className="text-[13px] font-bold text-content-primary">{t('revisingTitle')}</span>
            </div>
            <div className="rounded-md border border-border-divider bg-surface-page px-4 py-4">
              <div className="shimmer" />
            </div>
            <p className="text-[11.5px] leading-relaxed text-content-muted">{t('revisingHint')}</p>
          </div>
          <div className="flex items-center justify-end border-t border-border-divider px-5 py-3.5">
            <button onClick={onClose} className={ghostBtn}>{t('close')}</button>
          </div>
        </>
      ) : feedbackView ? (
        /* 修订反馈视图 */
        <>
          <div className="flex flex-col gap-3 px-5 py-4">
            <p className="text-[12.5px] leading-relaxed text-content-secondary">
              <b className="text-content-primary">{t('reviseTitle')}</b>
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
            <button onClick={() => setFeedbackView(false)} disabled={isSubmitting} className={ghostBtn}>
              {t('cancel')}
            </button>
            <button
              onClick={() => onRevise(feedback.trim())}
              disabled={isSubmitting || !feedback.trim()}
              className={primaryBtn}
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('confirmRevise')}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* 计划视图 */}
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
          {/* 底部：编辑 / 终止 / 修订并重提 / 批准 */}
          <div className="flex flex-wrap items-center gap-2.5 border-t border-border-divider px-5 py-3.5">
            <button
              onClick={() => setIsEditing(v => !v)}
              disabled={isSubmitting}
              className={cn(ghostBtn, 'mr-auto')}
            >
              {isEditing ? t('finishEdit') : t('editPlan')}
            </button>
            <button onClick={onTerminate} disabled={isSubmitting} className={dangerBtn}>
              {t('terminateTask')}
            </button>
            <button
              onClick={() => setFeedbackView(true)}
              disabled={isSubmitting}
              className={ghostBtn}
            >
              {t('revisePlan')}
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
      )}
    </ModalShell>
  )
}

export default PlanReviewModal
