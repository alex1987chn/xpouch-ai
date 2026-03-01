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
}
