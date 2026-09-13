/**
 * 复现并锁住「审批卡不点 → 刷新 → 点新建会话 → 底部残留加载条」这个缺陷。
 *
 * 实测路径（用户报的）：
 *   1. 会话 A 的 run 停在 `waiting_for_approval`（审批卡不点）
 *   2. 刷新页面 → `useSessionRestore` 恢复出可控 run → 交接 effect 启动轮询
 *      （HITL 时状态机停在 `hitl_paused`，但 `isPolling` 仍为 true）
 *   3. 点「新建会话」→ `WorkbenchPage.handleNewChat` 调 `resetAll(true)`
 *      → `resetUI()` 把 `activeRunId` 置空
 *   4. **没人停轮询**：唯一会停的路径是交接 effect 的「没有可控任务」分支，
 *      而它前面会先被 `!isRestored` 拦掉（新建会话时 restore 被禁用/重置）
 *   5. 查询 enabled 依赖 `activeRunId` → 永远不执行 → 状态恒为 null
 *      → 底部一直显示「正在恢复任务连接…(Unknown)」，直到整页刷新
 *
 * 修复是不变量式的：`isPolling && !activeRunId` 即停（见 isPollingOrphaned），
 * 所以任何未来新增的「清 runId」路径都被覆盖，而不是只补「新建会话」这一处。
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { useRunPolling } from '../useRunPolling'
import { useTaskStore } from '@/store/taskStore'

vi.mock('@/services/run', () => ({
  // 审批等待态：真实场景里轮询到它就是 HITL 暂停（isPolling 仍为 true）
  getRunStatus: vi.fn(async () => ({ status: 'waiting_for_approval' })),
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useRunPolling：run 被清掉后不得残留轮询状态', () => {
  beforeEach(() => {
    useTaskStore.getState().resetAll(true)
  })

  it('审批等待中新建会话（resetAll 清空 activeRunId）→ 轮询停止', async () => {
    useTaskStore.getState().setActiveRunId('run-A')
    const { result } = renderHook(() => useRunPolling({ enabled: true }), { wrapper })

    act(() => result.current.startPolling())
    await waitFor(() => expect(result.current.isPolling).toBe(true))

    // 用户在审批等待中点了「新建会话」：这正是 WorkbenchPage.handleNewChat 做的事
    act(() => useTaskStore.getState().resetAll(true))

    await waitFor(() => expect(result.current.isPolling).toBe(false))
    expect(result.current.currentStatus).toBeNull()
  })

  it('同样覆盖「切到另一个没有活跃 run 的会话」（resetUI 的其余清空路径）', async () => {
    useTaskStore.getState().setActiveRunId('run-A')
    const { result } = renderHook(() => useRunPolling({ enabled: true }), { wrapper })

    act(() => result.current.startPolling())
    await waitFor(() => expect(result.current.isPolling).toBe(true))

    act(() => useTaskStore.getState().clearActiveRunId())

    await waitFor(() => expect(result.current.isPolling).toBe(false))
  })

  it('run 还在时不会被误停（守卫不能过头）', async () => {
    useTaskStore.getState().setActiveRunId('run-A')
    const { result } = renderHook(() => useRunPolling({ enabled: true }), { wrapper })

    act(() => result.current.startPolling())
    await waitFor(() => expect(result.current.isPolling).toBe(true))

    // 给 React 几拍，确认没有因为「状态还没回来」而被守卫误判
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(result.current.isPolling).toBe(true)
  })
})
