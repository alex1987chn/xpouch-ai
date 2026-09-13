/**
 * 计划修订的**对照**（v(n) → v(n+1)）。
 *
 * ## 为什么按位置比，而不是按 id
 *
 * 修订路径（action=revise）在服务端是**删旧行、建新行**：v2 的每个任务都是新的
 * 子任务 UUID，`id` 跨版本没有任何延续性。按 id 比只会得到「全部删除 + 全部新增」，
 * 也就是一份没用的 diff。所以这里用 `sort_order`（位置）作为跨版本的对应键——
 * 这也是人读计划修订时的默认读法：第 1 条变了什么、第 2 条是否新增。
 *
 * 位置的已知局限（有意接受，写清楚免得当成 bug）：若修订在**中间插入**一条任务，
 * 其后所有位置的内容都会整体前移一格，于是显示为「后面几条都改了」。这对
 * 「专家据反馈重写了计划」这个主场景是**如实**的（它确实逐条重写了），
 * 但确实不如 id 对齐精细——没有稳定 id 可比，这是能做到的最好情况。
 *
 * 纯函数、无 IO：与 `agents/plan_waves.py` 的波次判定同理，判定逻辑可单独钉住。
 */

import type { TaskInfo } from '@/types/events'

export type PlanDiffKind = 'same' | 'changed' | 'added' | 'removed'

export interface PlanDiffRow {
  kind: PlanDiffKind
  /** 修订前该位置的任务（新增时为 undefined） */
  before?: TaskInfo
  /** 修订后该位置的任务（删除时为 undefined） */
  after?: TaskInfo
  /** 位置（0 起），用于展示「第 N 条」 */
  index: number
}

export interface PlanDiffSummary {
  added: number
  removed: number
  changed: number
  same: number
  /** 是否没有任何改动（用于决定要不要展示改动区） */
  isEmpty: boolean
}

/** 两条任务在「读起来是否同一条」的意义上是否一致。 */
function sameTaskContent(a: TaskInfo, b: TaskInfo): boolean {
  return (
    a.description === b.description &&
    a.expert_type === b.expert_type &&
    sameDeps(a.depends_on, b.depends_on)
  )
}

function sameDeps(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = [...(a ?? [])].sort()
  const right = [...(b ?? [])].sort()
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/** 逐位置比对两份计划，返回对齐后的行（顺序 = 修订后的顺序，末尾补被删除的行）。 */
export function diffPlans(before: readonly TaskInfo[], after: readonly TaskInfo[]): PlanDiffRow[] {
  const rows: PlanDiffRow[] = []
  const max = Math.max(before.length, after.length)

  for (let index = 0; index < max; index += 1) {
    const prev = before[index]
    const next = after[index]
    if (prev && next) {
      rows.push({ kind: sameTaskContent(prev, next) ? 'same' : 'changed', before: prev, after: next, index })
    } else if (next) {
      rows.push({ kind: 'added', after: next, index })
    } else if (prev) {
      rows.push({ kind: 'removed', before: prev, index })
    }
  }
  return rows
}

export function summarizePlanDiff(rows: readonly PlanDiffRow[]): PlanDiffSummary {
  const summary: PlanDiffSummary = { added: 0, removed: 0, changed: 0, same: 0, isEmpty: true }
  for (const row of rows) {
    summary[row.kind] += 1
  }
  summary.isEmpty = summary.added + summary.removed + summary.changed === 0
  return summary
}

/** 只保留有改动的行（UI 默认展示这一份，避免把「没变」也铺满屏幕）。 */
export function changedRowsOnly(rows: readonly PlanDiffRow[]): PlanDiffRow[] {
  return rows.filter((row) => row.kind !== 'same')
}
