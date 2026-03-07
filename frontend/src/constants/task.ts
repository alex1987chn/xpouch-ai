/**
 * 任务相关常量
 */

/**
 * 简单模式下的虚拟任务 ID
 *
 * @description
 * 简单模式下，所有消息和 artifact 都归属于这个虚拟任务
 * 复杂模式下，任务与产物由后端返回的 execution plan 承载
 */
export const SIMPLE_TASK_ID = 'simple_session'
