/**
 * Artifact 相关事件处理器
 * 
 * 处理的事件类型：
 * - artifact.generated: 产物生成（批处理模式）
 */

import type { ArtifactGeneratedEvent } from './types'
import type { HandlerContext } from './types'
import { logger } from '@/utils/logger'

/**
 * 处理 artifact.generated 事件
 *
 * 批处理模式：事件本身就带完整产物。产物的**唯一真相在服务端**
 * （ArtifactCanvas 走 /artifacts 查询、正文按 id 取详情），所以这里只做一件事：
 * 把产物引用挂到该任务的执行步骤上（下方内联卡片），不再往本地 store 里存副本。
 *
 * [2026-09-13 清理] 删除的旧行为：
 * - `addArtifact`：把产物塞进本地任务副本的 `task.artifacts`，而那份副本没有任何
 *   消费者（见 store/taskStore.ts）。
 * - 「智能选中」`selectTask`：维护 `selectedTaskId`，同样无消费者（资源画布按 thread
 *   取数，不依赖任务的选中态）。
 */
export function handleArtifactGenerated(
  event: ArtifactGeneratedEvent,
  context: HandlerContext
): void {
  const { debug } = context

  if (debug) {
    logger.debug('[ArtifactEvents] artifact.generated: 收到事件', {
      taskId: event.data.task_id,
      artifactId: event.data.artifact.id,
      artifactType: event.data.artifact.type,
      contentLength: event.data.artifact.content?.length || 0
    })
  }

  // 同步到思考步骤：在该任务的执行步骤下方内联一张产物卡片
  // （点击复用 ArtifactViewerModal 预览）。只存最小字段，正文按 id 取详情。
  attachArtifactToStep(context, event.data.task_id, event.data.artifact)
}

/**
 * 把产物引用挂到对应任务的执行步骤上。
 *
 * 为什么挂在思考步骤而不是新建消息：执行期间唯一在更新的可见区域就是思考面板
 * （见 ChatStreamPanel 的 thinking 渲染），把产物挂在那里用户才能"边执行边看到
 * 产出"。查找方式与 task.completed 一致（最后一条带 thinking 的助手消息 + 按
 * task_id 匹配步骤），保证同一任务的产出与状态落在同一行。
 */
function attachArtifactToStep(
  context: HandlerContext,
  taskId: string,
  artifact: { id: string; type: string; title?: string | null }
): void {
  const { chatStore } = context
  const messages = chatStore.messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant' || !msg.id || !msg.metadata?.thinking) continue

    const thinking = msg.metadata.thinking
    const stepIndex = thinking.findIndex(s => s.id === taskId)
    if (stepIndex < 0) continue

    const step = thinking[stepIndex]
    const existing = step.artifacts || []
    if (existing.some(a => a.id === artifact.id)) return // 幂等：重复事件不重复挂

    const next = [...thinking]
    next[stepIndex] = {
      ...step,
      artifacts: [
        ...existing,
        { id: artifact.id, type: artifact.type, title: artifact.title ?? null },
      ],
    }
    chatStore.updateMessageMetadata(msg.id, { thinking: next })
    return
  }
}
