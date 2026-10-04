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
 * 九种转换（见函数），每个转换一次性写齐三份投影，结构上不可能再出现
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
 * 流收尾（与 beginStreaming 对偶）。**流生命周期结束 ≠ 执行结束**：
 * - 流在 HITL 中断处正常 resolve（初始发送/重试打到审批点）：waiting 是
 *   SSE 事件面刚落下的 run 真相（setPendingPlan），审批卡可见性与轮询
 *   锚点都靠它——只终结生成态（同 detachStream），runId 留给审批/轮询接管。
 * - 其余情况（message.done 正常完成 / 失败收尾）：与 endExecution 等价。
 *
 * 为什么不由调用方分支：finalizeStream 曾直调 endExecution，把 waiting 一并
 * 归零——初始发送打到审批点时审批卡当场被撤、轮询锚点丢失，页面停在规划帧
 * （2026-10-04 实测回归，用户只能重进会话靠 restore 救回）。流/执行的语义差
 * 必须封装在唯一写入入口，散在 hook 里就是下一颗雷。
 */
export function endStream(options: { keepRunId?: boolean } = {}): void {
  if (useTaskStore.getState().isWaitingForApproval) {
    detachStream()
    return
  }
  endExecution(options)
}

/**
 * 前端放弃接管（轮询错误停止等）：清生成态与接管对象，**不动审批卡**。
 *
 * 为什么不清 waiting：轮询在 run 等审批期间也在跑（hitl_paused 态），连续
 * 网络错误只说明「前端跟丢了」，run 在服务端可能仍好好等着——审批卡属于
 * run 的真相，前端失联不构成撤卡理由（用 endExecution 会在网络抖动时撤卡，
 * 2026-10-04 二轮 review 抓出的回归，原实现恰好只清 generating/runId）。
 */
export function abandonTracking(): void {
  useChatStore.getState().setGenerating(false)
  useTaskStore.getState().clearActiveRunId()
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
