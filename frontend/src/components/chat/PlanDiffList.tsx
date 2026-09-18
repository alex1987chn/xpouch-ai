/**
 * 计划修订对照列表（HITL 二期）。
 *
 * 展示「上一版 → 本次修订」的改动，回答用户最关心的那个问题：驳回之后，专家到底
 * 改了什么。对齐规则与局限见 `lib/planDiff` 的模块说明（**按位置对齐**——修订是
 * 删旧行建新行，id 跨版本没有延续性）。
 *
 * 版式：左右对照（v1 | v2）——弹窗纵向空间紧，对照比纵向列表更省空间且一眼看出
 * 「左旧右新」。只渲染有改动的行（未改动的用一句「其余 N 条未变」带过）：审批场景
 * 下用户要的是「差异」，不是把整份计划再读一遍。改动行的左格（旧值）高亮，
 * 新增行的右格高亮、删除行的左格高亮。
 *
 * 配色遵循「危险才红」：删除用中性灰 + 删除线，改动用琥珀，新增用鼠尾草绿——
 * 都是「信息」而不是「报警」。
 */

import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { changedRowsOnly, diffPlans, summarizePlanDiff, type PlanDiffRow } from '@/lib/planDiff'
import { useExpertLabel } from '@/hooks/useExpertLabel'
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

/** 任务卡片的一格：描述 + 执行者。isOld 时旧值用 muted 底色（改动行的左侧强调）。 */
function DiffCell({
  task,
  tone,
}: {
  task: TaskInfo | undefined
  tone: 'neutral' | 'old' | 'added' | 'removed'
}) {
  const { t } = useTranslation()
  const expertLabelOf = useExpertLabel()
  const bg = {
    neutral: 'bg-surface-page',
    old: 'bg-accent-warning/15',
    added: 'bg-accent-success/15',
    removed: 'bg-surface-tint/60',
  }[tone]
  return (
    <div className={cn('flex flex-col gap-1 rounded-sm px-2.5 py-2', bg)}>
      {task ? (
        <>
          <p
            className={cn(
              'text-body-sm leading-relaxed',
              tone === 'removed' ? 'text-content-muted line-through' : 'text-content-primary'
            )}
          >
            {task.description}
          </p>
          {task.expert_type && (
            <p className="text-tiny text-content-muted">
              {t('planStepExecutor', { expert: expertLabelOf(task.expert_type) })}
            </p>
          )}
        </>
      ) : (
        <span className="text-body-sm text-content-muted">—</span>
      )}
    </div>
  )
}

export function PlanDiffList({ before, after }: PlanDiffListProps) {
  const { t } = useTranslation()
  const rows = changedRowsOnly(diffPlans(before, after))
  const summary = summarizePlanDiff(rows)

  if (summary.isEmpty) {
    return (
      <p className="text-caption leading-relaxed text-content-muted">{t('planDiffNoChanges')}</p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 列头：v1（旧）| v2（新） */}
      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
        <span className="w-8" />
        <span className="text-tiny font-bold text-content-muted">v1（上一版）</span>
        <span className="text-tiny font-bold text-content-muted">v2（本次修订）</span>
      </div>
      {rows.map((row) => {
        const kind = row.kind as ChangedKind
        const isChanged = kind === 'changed'
        return (
          <div
            key={`${row.kind}-${row.index}`}
            className="grid grid-cols-[auto_1fr_1fr] items-start gap-2 rounded-md border border-border-divider bg-surface-page p-2"
          >
            <span
              className={cn(
                'mt-1.5 flex h-5 shrink-0 items-center justify-center rounded-full px-1.5 text-nano font-bold',
                KIND_STYLE[kind]
              )}
            >
              {t(KIND_LABEL_KEY[kind])}
            </span>
            <DiffCell
              task={row.before}
              tone={kind === 'removed' ? 'removed' : isChanged ? 'old' : 'neutral'}
            />
            <DiffCell task={row.after} tone={kind === 'added' ? 'added' : 'neutral'} />
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
