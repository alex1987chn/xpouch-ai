/**
 * 计划修订对照列表（HITL 二期）。
 *
 * 展示「上一版 → 本次修订」的改动，回答用户最关心的那个问题：驳回之后，专家到底
 * 改了什么。对齐规则与局限见 `lib/planDiff` 的模块说明（**按位置对齐**——修订是
 * 删旧行建新行，id 跨版本没有延续性）。
 *
 * 只渲染有改动的行（未改动的用一句「其余 N 条未变」带过）：审批场景下用户要的是
 * 「差异」，不是把整份计划再读一遍。
 *
 * 配色遵循「危险才红」：删除用中性灰 + 删除线，改动用琥珀，新增用鼠尾草绿——
 * 都是「信息」而不是「报警」。
 */

import { ArrowRight } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { changedRowsOnly, diffPlans, summarizePlanDiff, type PlanDiffRow } from '@/lib/planDiff'
import type { TaskInfo } from '@/types/events'

/** 有改动的那三类（'same' 不会渲染） */
type ChangedKind = Exclude<PlanDiffRow['kind'], 'same'>

const KIND_STYLE: Record<ChangedKind, string> = {
  changed: 'bg-accent-warning/15 text-accent-warning',
  added: 'bg-accent-success/15 text-accent-success',
  removed: 'bg-surface-tint text-content-muted',
}

const KIND_LABEL_KEY = {
  changed: 'planDiffKindChanged',
  added: 'planDiffKindAdded',
  removed: 'planDiffKindRemoved',
} as const satisfies Record<ChangedKind, string>

interface PlanDiffListProps {
  before: TaskInfo[]
  after: TaskInfo[]
}

export function PlanDiffList({ before, after }: PlanDiffListProps) {
  const { t } = useTranslation()
  const rows = changedRowsOnly(diffPlans(before, after))
  const summary = summarizePlanDiff(rows)

  if (summary.isEmpty) {
    return <p className="text-caption leading-relaxed text-content-muted">{t('planDiffNoChanges')}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const kind = row.kind as ChangedKind
        return (
          <div
            key={`${row.kind}-${row.index}`}
            className="flex gap-3 rounded-md border border-border-divider bg-surface-page p-3"
          >
            <span
              className={cn(
                'mt-0.5 flex h-5 shrink-0 items-center justify-center rounded-full px-1.5 text-nano font-bold',
                KIND_STYLE[kind]
              )}
            >
              {t(KIND_LABEL_KEY[kind])}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {row.before && (
                <p
                  className={cn(
                    'text-body-sm leading-relaxed',
                    row.kind === 'removed'
                      ? 'text-content-muted line-through'
                      : 'text-content-muted'
                  )}
                >
                  {row.before.description}
                </p>
              )}
              {row.after && (
                <p className="text-body-sm leading-relaxed text-content-primary">
                  {row.after.description}
                </p>
              )}
              {row.before && row.after && row.before.expert_type !== row.after.expert_type && (
                <p className="flex items-center gap-1 text-tiny text-content-muted">
                  {t('planStepExecutor', { expert: row.before.expert_type })}
                  <ArrowRight className="h-3 w-3" />
                  {t('planStepExecutor', { expert: row.after.expert_type })}
                </p>
              )}
            </div>
          </div>
        )
      })}
      {summary.same > 0 && (
        <p className="text-caption text-content-muted">
          {t('planDiffUnchanged', { count: summary.same })}
        </p>
      )}
    </div>
  )
}
