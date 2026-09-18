/**
 * MCP 服务器类型定义
 *
 * 契约真相源是后端 schemas/mcp.py（→ api.generated.ts）；
 * 底部 SameShape 锚点锁住手写类型与生成物逐字段一致（含可选性与 null），
 * 后端契约变更而前端没跟上时，本文件编译期报红。
 */

import type { components } from '@/types/api.generated'

// ============================================================================
// 连接状态
// ============================================================================

export type MCPConnectionStatus = 'unknown' | 'connected' | 'error'

/**
 * MCP 传输协议类型
 */
export type MCPTransport = 'sse' | 'streamable_http'

// ============================================================================
// 数据模型
// ============================================================================

/**
 * MCP 服务器接口
 */
export interface MCPServer {
  id: string
  name: string
  description: string | null
  sse_url: string
  transport: MCPTransport
  is_active: boolean
  icon: string | null
  connection_status: MCPConnectionStatus
  created_at: string
  updated_at: string
}

/**
 * 创建 MCP 服务器的 DTO
 */
export interface MCPServerCreate {
  name: string
  description?: string | null
  sse_url: string
  transport: MCPTransport
  icon?: string | null
}

/**
 * 更新 MCP 服务器的 DTO
 */
export interface MCPServerUpdate {
  name?: string | null
  description?: string | null
  sse_url?: string | null
  transport?: MCPTransport | null
  is_active?: boolean | null
  icon?: string | null
}

// ============================================================================
// REST 契约锚点（范式沿 types/events.ts 的 SameShape / services/stats.ts）
// ============================================================================

/** 双向相等：手写类型与后端生成类型**逐字段一致**（含可选性与 null）。 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

type _MCPServer = Assert<SameShape<MCPServer, components['schemas']['MCPServerResponse']>>
type _MCPServerCreate = Assert<
  SameShape<MCPServerCreate, components['schemas']['MCPServerCreate']>
>
type _MCPServerUpdate = Assert<
  SameShape<MCPServerUpdate, components['schemas']['MCPServerUpdate']>
>

/** 上面这组断言只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type McpConformanceAnchors = [_MCPServer, _MCPServerCreate, _MCPServerUpdate]
