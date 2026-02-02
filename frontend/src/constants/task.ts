/**
 * 任务相关常量
 */

/**
 * 简单模式下的任务会话 ID
 *
 * @description
 * 简单模式下，所有消息和 artifact 都归属于这个虚拟任务会话
 * 复杂模式下，使用后端返回的 session_id
 */
export const SIMPLE_TASK_ID = 'simple_session'
