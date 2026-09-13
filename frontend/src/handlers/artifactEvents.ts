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
 * 批处理模式 - 直接添加完整的 artifact
 * 添加产物到对应任务
 * 
 * 🔥 智能选中策略：
 * - 如果用户没有选中任何任务，自动选中新完成的有产物任务
 * - 如果用户已手动选中某个任务，保持不变（避免打断用户查看）
 */
export function handleArtifactGenerated(
  event: ArtifactGeneratedEvent,
  context: HandlerContext
): void {
  const { taskStore, debug } = context
  const { addArtifact, selectTask, selectedTaskId, tasks } = taskStore

  // 🔥 调试日志：记录当前状态
  if (debug) {
    const task = tasks.get(event.data.task_id)
    logger.debug('[ArtifactEvents] artifact.generated: 收到事件', {
      taskId: event.data.task_id,
      artifactId: event.data.artifact.id,
      artifactType: event.data.artifact.type,
      taskExists: !!task,
      currentArtifactsCount: task?.artifacts?.length || 0
    })
  }

  addArtifact(event.data)

  // 🔥 智能选中：只有当用户未选中任务，或选中的任务无产物时，才自动切换
  const currentSelectedTask = selectedTaskId ? tasks.get(selectedTaskId) : null
  const shouldAutoSelect =
    !selectedTaskId ||
    (currentSelectedTask && currentSelectedTask.artifacts.length === 0)

  if (shouldAutoSelect) {
    selectTask(event.data.task_id)
  }

  if (debug) {
    logger.debug(
      '[ArtifactEvents] 产物已添加:',
      event.data.artifact.id,
      event.data.artifact.type,
      '内容长度:',
      event.data.artifact.content?.length || 0
    )
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
