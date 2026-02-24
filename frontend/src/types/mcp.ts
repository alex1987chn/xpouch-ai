/**
 * MCP 服务器类型定义
 * 
 * 与后端 SQLModel 定义对应
 */

// ============================================================================
// 连接状态
// ============================================================================

export type MCPConnectionStatus = 'unknown' | 'connected' | 'error'

// ============================================================================
// 数据模型
// ============================================================================

/**
 * MCP 服务器接口
 */
export interface MCPServer {
  id: string
  name: string
  description?: string
  sse_url: string
  is_active: boolean
  icon?: string
  connection_status: MCPConnectionStatus
  created_at: string
  updated_at: string
}

/**
 * 创建 MCP 服务器的 DTO
 */
export interface MCPServerCreate {
  name: string
  description?: string
  sse_url: string
  icon?: string
}

/**
 * 更新 MCP 服务器的 DTO
 */
export interface MCPServerUpdate {
  name?: string
  description?: string
  sse_url?: string
  is_active?: boolean
  icon?: string
}
