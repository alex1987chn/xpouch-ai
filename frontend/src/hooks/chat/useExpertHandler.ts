/**
 * 专家事件处理 Hook (已废弃)
 * 
 * [状态]
 * 由于架构重构，Task 相关事件改由 eventHandlers.ts 直接处理
 * 本文件保留但仅作兼容，不再处理任何事件
 * 
 * [原职责]
 * 处理 plan.created 事件，构建 Thinking Process 的 Steps
 * 
 * [架构变更]
 * v3.2.0: 事件分发链路重构
 * - chat.ts 分流：message 事件 -> onChunk, Task 事件 -> handleServerEvent
 * - TaskStore 更新：仅由 eventHandlers.ts 处理
 * - Thinking Steps 更新：移至 eventHandlers.ts
 */

import { useCallback, useMemo } from 'react'
import type { AnyServerEvent } from '@/types/events'

/**
 * 专家事件处理 Hook (兼容版本)
 * @deprecated 不再处理任何事件，Task 逻辑已移至 eventHandlers.ts
 */
export function useExpertHandler() {
  /**
   * 处理事件（空实现）
   * 由于 chat.ts 已分流，只有 message.* 事件会到达此处
   * Task 相关事件(plan/task/artifact)不再经过此 hook
   */
  const handleExpertEvent = useCallback(async (
    _event: AnyServerEvent,
    _conversationMode: 'simple' | 'complex'
  ) => {
    // 所有 Task 事件处理已移至 eventHandlers.ts
    // 本 hook 不再处理任何事件
  }, [])

  return useMemo(() => ({
    handleExpertEvent,
  }), [handleExpertEvent])
}
