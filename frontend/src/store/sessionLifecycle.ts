/**
 * 会话生命周期编排（前端状态三轨统一 · Phase B）
 *
 * 【为什么存在】「离开一个会话」的清态序列（清消息 → 清线程标识 → 重置执行态）
 * 曾在 5 处手写重复（地层切换/命令面板两处/删除当前会话两处/新建会话）。三轨
 * 状态（chatStore / taskStore / react-query）没有所有权规则时，每次手写都是
 * 一次顺序事故的机会——2026-10-03「执行中切会话卡空态」即编排顺序错误的
 * 直接产物（清残留 effect 与挂断 effect 分居两处、恢复守卫夹在中间读到旧值）。
 *
 * 【规则】所有「离开/重置当前会话」必须经 `leaveCurrentThread()`，组件不得
 * 再手写三连调用。进入会话的编排（挂断旧流 + 清残留 + 预设新线程标识）在
 * WorkbenchChatCore 的切换 effect 单点实现，不经此模块（它需要 effect 时序）。
 *
 * 【所有权快览】完整清单见 docs/FRONTEND-STATE.md：
 * - chatStore：会话内 UI 态（messages / currentThreadId / inputMessage）
 * - taskStore：执行与审批态（mode / activeRunId / pendingPlan 家族 / isWaitingForApproval）
 * - react-query：服务端数据（会话列表 / 产物 / 模型 / 设置）——只经 invalidate 失效
 */

import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'

/**
 * 离开当前会话：清空消息与线程标识、重置执行/审批态。
 *
 * 幂等；不负责导航（URL 由调用方决定去向）与在途流挂断——流的挂断由
 * WorkbenchChatCore 的线程切换 effect 按 prevThreadId 判定执行（那里的
 * 时序是修复 2026-10-03 事故的一部分，勿并入此处）。
 */
export function leaveCurrentThread(): void {
  useChatStore.getState().setMessages([])
  useChatStore.getState().setCurrentThreadId(null)
  useTaskStore.getState().resetAll(true)
}
