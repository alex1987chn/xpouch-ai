// API 服务 - 通用业务 API
// 非聊天相关的业务 API（认证、用户、智能体管理等）
// 
// [架构说明]
// 本文件是 Barrel File（桶文件），仅负责重新导出各子模块的 API 函数和类型。
// 所有具体实现已迁移到以下子模块：
// - auth.ts: 认证相关（登录、验证码、Token 刷新）
// - agent.ts: 智能体管理（CRUD 操作）
// - user.ts: 用户资料管理
// - chat.ts: 聊天会话、消息流、Artifact、HITL 恢复
// - admin.ts: 管理员功能（专家配置等）
// - common.ts: 通用工具函数（getHeaders, buildUrl, handleResponse）

// ============================================================================
// 从 @/types 重新导出核心类型（供外部直接使用）
// ============================================================================
export type { Conversation, UserProfile, ApiMessage } from '@/types'

// 为了向后兼容，导出别名
export type { ApiMessage as ChatMessage } from '@/types'

// ============================================================================
// Barrel Exports: 从各子模块重新导出所有 API 函数和类型
// ============================================================================

// 认证服务 (Authentication)
export * from './auth'

// 智能体服务 (Agent Management)
export * from './agent'

// 用户服务 (User Profile)
export * from './user'

// 聊天服务 (Chat, Message Stream, Artifact, HITL)
// 包含: sendMessage, updateArtifact, resumeChat, getConversations, etc.
export * from './chat'

// 管理员服务 (Admin)
export * from './admin'

// MCP 服务 (MCP Server Registry)
export * from './mcp'

// 通用工具（按需导出）
export { getHeaders, buildUrl, handleResponse } from './common'
