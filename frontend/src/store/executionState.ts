/**
 * 执行态转换（前端状态三轨统一 · Phase C）
 *
 * 【为什么存在】「本会话有活着的执行」这一个事实，曾以三份投影分散在三处：
 * `chatStore.isGenerating`（生成中）、`taskStore.isWaitingForApproval`（等审批）、
 * `taskStore.activeRunId`（接管的 run）。十几个写入点各自手写组合，任何一处
 * 漏一个标志就是状态机泄漏——史实案底：终止后停止键挂着没人清生成态、恢复后
 * 点批准被 isGenerating 误拦、修订后输入台停在生成中（三起都修在各自点位上）。
 *
 * 【规则】本模块是这三份投影在**组件/hook 层的唯一写入入口**。合法组合只有
 * 七种转换（见函数），每个转换一次性写齐三份投影，结构上不可能再出现
 * 「清了 A 忘了 B」。例外写入面（见 docs/FRONTEND-STATE.md）：
 * - SSE 事件面：systemEvents 经 `setPendingPlan` 下发审批数据（slice 内置
 *   waiting=true，数据到达即等待裁决）
 * - 服务端校准面：useSessionRestore（经 adoptRestoredExecution 进本模块）
 * - 会话生命周期：leaveCurrentThread / resetAll（整体重置）
 *
 * 【投影不变量】（读者可依赖）
 * - isGenerating === 本地有活流（simple 模式无 run 时 activeRunId 可为 null）
 * - isWaitingForApproval === 审批卡可见（等人是等，不是生成）
 * - activeRunId 非空 ⟺ 存在被前端接管的 run（轮询/审批/后台任务）
 */

import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'

/** 开始流式执行（发送/恢复/重试）。runId 已知则一并接管；simple 模式无 run 传 undefined。 */
export function beginStreaming(runId?: string | null): void {
  useTaskStore.getState().setIsWaitingForApproval(false)
  if (runId) useTaskStore.getState().setActiveRunId(runId)
  useChatStore.getState().setGenerating(true)
}

/** 流中收到 runtimeMeta.runId 时补记接管对象（不碰生成态）。 */
export function attachRunId(runId: string): void {
  useTaskStore.getState().setActiveRunId(runId)
}

/**
 * 挂断在途流（切会话/页面离开）：生成态终结，**runId 保留**——服务端任务还
 * 在跑，轮询/恢复要靠它接管现场（与「用户主动停止」语义严格区分）。
 */
export function detachStream(): void {
  useChatStore.getState().setGenerating(false)
}

/** 进入等待审批：审批卡可见，生成态必须为假（等人不是生成）。 */
export function beginAwaitingApproval(): void {
  useChatStore.getState().setGenerating(false)
  useTaskStore.getState().setIsWaitingForApproval(true)
}

/** 审批动作已受理（批准点击/离开等待）：只撤审批卡，后续状态由流/轮询接管。 */
export function resolveApproval(): void {
  useTaskStore.getState().setIsWaitingForApproval(false)
}

/**
 * 执行终点（流收尾/轮询终态/终止成功/组件卸载）：三投影归零。
 * `keepRunId`：流中断但服务端任务还活着时保留接管对象（轮询接力的锚点）。
 */
export function endExecution(options: { keepRunId?: boolean } = {}): void {
  useChatStore.getState().setGenerating(false)
  useTaskStore.getState().setIsWaitingForApproval(false)
  if (!options.keepRunId) useTaskStore.getState().clearActiveRunId()
}

/**
 * 恢复路径的服务端校准入口：按 GET /threads 的真相一次性对齐三投影。
 * `streaming` 仅对 running/resuming 为真（等待审批是等人，不是生成——
 * 恢复曾把全部「可控」态都标成生成中，导致刷新后点批准被本地误拦）。
 */
export function adoptRestoredExecution(runId: string, streaming: boolean): void {
  useTaskStore.getState().setActiveRunId(runId)
  useChatStore.getState().setGenerating(streaming)
}
