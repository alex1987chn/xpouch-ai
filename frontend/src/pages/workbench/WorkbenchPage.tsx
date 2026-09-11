/**
 * WorkbenchPage - 工作台（阶段 2 新 IA 的引力中心）
 *
 * [设计] 对话即桌面：左会话地层 / 中对话流 / 右产物画布（docs/design 蓝本）。
 * 路由 /workbench（新会话）与 /workbench/:threadId（切换线程）。
 * 线程切换只重挂载中栏核心（key=threadId），地层与画布不重挂载（保滚动与状态）。
 *
 * [迁移期] 分支内并行存在（旧 /chat 不动）；切换+删除在最终 cutover commit 完成。
 */

import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { SessionStrata } from './SessionStrata'
import { WorkbenchChatCore } from './WorkbenchChatCore'
import { ArtifactCanvas } from './ArtifactCanvas'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'

export default function WorkbenchPage() {
  const { id: threadId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // 新会话：清残留聊天态（从旧线程返回 /workbench 时）
  const handleNewChat = useCallback(() => {
    useChatStore.getState().setMessages([])
    useChatStore.getState().setCurrentConversationId(null)
    useTaskStore.getState().resetAll(true)
    navigate('/workbench')
  }, [navigate])

  return (
    <div className="flex h-full min-h-0 w-full">
      <SessionStrata activeThreadId={threadId ?? null} onNewChat={handleNewChat} />
      <WorkbenchChatCore key={threadId || 'new'} threadId={threadId ?? null} />
      <ArtifactCanvas threadId={threadId ?? null} />
    </div>
  )
}
