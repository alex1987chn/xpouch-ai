/**
 * API 服务统一导出
 * 
 * [架构说明]
 * 本文件是 API 服务的根入口，通过 api.ts 统一导出所有功能。
 * 
 * 子模块结构：
 * - auth.ts: 认证相关（登录、验证码、Token 刷新）
 * - agent.ts: 智能体管理（CRUD 操作）
 * - user.ts: 用户资料管理
 * - chat.ts: 聊天会话、消息流、Artifact、HITL 恢复
 * - admin.ts: 管理员功能（专家配置等）
 * - common.ts: 通用工具函数（getHeaders, buildUrl, handleResponse）
 * 
 * 推荐使用方式：
 * ```typescript
 * import { sendMessage, getAllAgents, getUserProfile } from '@/services'
 * ```
 */

// 从 api.ts 重新导出所有功能
export * from './api'

// 单独导出通用工具（便于直接使用）
export { getClientId } from './common'
