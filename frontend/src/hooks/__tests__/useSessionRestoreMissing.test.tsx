/**
 * 会话恢复的 404 归类（2026-09-13，用户报「打开像首页」那一族的另一半）。
 *
 * 要钉死的两条：
 * 1. 会话在服务端不存在（已删除 / 链接有误）→ `isMissingSession`，界面给明确状态；
 *    且必须**结算**（isRestored=true），否则初始恢复 effect 会反复重试成死循环。
 * 2. 瞬时 404（首条消息刚落库那一瞬）→ 静默重试一次即成功，不得误报「会话不存在」。
 *
 * 为什么值得单独测：修复前这两条走的是同一句 `logger.debug + 停在空页面`，
 * 表现与「真的打开首页」完全一样，靠肉眼与实机都分不清。
 */

import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionRestore } from '../useSessionRestore'
import { useChatStore } from '@/store/chatStore'

const getConversation = vi.fn()

vi.mock('@/services/chat', () => ({
  getConversation: (...args: unknown[]) => getConversation(...args),
}))
vi.mock('@/services/runs', () => ({
  getRunTimeline: vi.fn(async () => ({ events: [] })),
}))
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

type HookState = ReturnType<typeof useSessionRestore>
let hookState: HookState | null = null

function Harness() {
  hookState = useSessionRestore({ enabled: true })
  return null
}

function renderAt(threadId: string) {
  return render(
    <MemoryRouter initialEntries={[`/workbench/${threadId}`]}>
      <Routes>
        <Route path="/workbench/:id" element={<Harness />} />
      </Routes>
    </MemoryRouter>
  )
}

const notFound = Object.assign(new Error('会话不存在'), { status: 404 })

describe('useSessionRestore：404 的两个分支', () => {
  beforeEach(() => {
    getConversation.mockReset()
    hookState = null
    useChatStore.getState().setMessages([])
  })

  it('两次都 404 → 判定为会话不存在，并结算（不反复重试）', async () => {
    getConversation.mockRejectedValue(notFound)

    renderAt('gone-1')

    await waitFor(() => expect(hookState?.isMissingSession).toBe(true), { timeout: 4000 })
    expect(hookState?.isRestored).toBe(true)
    expect(getConversation).toHaveBeenCalledTimes(2) // 一次 + 静默重试一次，不再多试
  })

  it('首次 404、重试成功 → 正常恢复，不误报会话不存在', async () => {
    getConversation
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({
        id: 't1',
        messages: [
          { id: 'm1', role: 'user', content: '问题', timestamp: '2026-09-13T10:00:00' },
        ],
        latest_run: null,
      })

    renderAt('t1')

    await waitFor(
      () => expect(useChatStore.getState().messages.length).toBe(1),
      { timeout: 4000 }
    )
    expect(hookState?.isMissingSession).toBe(false)
    expect(hookState?.isRestored).toBe(true)
  })
})
