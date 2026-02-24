/**
 * MCP 服务器相关 API 服务
 * 
 * 提供 MCP 服务器的 CRUD 操作
 */

import { getHeaders, buildUrl, handleResponse } from './common'
import type { MCPServer, MCPServerCreate, MCPServerUpdate } from '@/types/mcp'

// 重新导出类型供外部使用
export type { MCPServer, MCPServerCreate, MCPServerUpdate }

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取所有 MCP 服务器列表
 */
export async function getMCPServers(): Promise<MCPServer[]> {
  const response = await fetch(buildUrl('/mcp/servers'), {
    headers: getHeaders()
  })
  return handleResponse<MCPServer[]>(response, '获取 MCP 服务器列表失败')
}

/**
 * 创建 MCP 服务器
 * 
 * 后端会自动执行 SSE 连接测试，连接失败会返回 400 错误
 */
export async function createMCPServer(data: MCPServerCreate): Promise<MCPServer> {
  const response = await fetch(buildUrl('/mcp/servers'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse<MCPServer>(response, '添加 MCP 服务器失败')
}

/**
 * 更新 MCP 服务器
 * 
 * 支持部分更新，用于 Toggle 开关等场景
 */
export async function updateMCPServer(
  id: string,
  data: MCPServerUpdate
): Promise<MCPServer> {
  const response = await fetch(buildUrl(`/mcp/servers/${id}`), {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse<MCPServer>(response, '更新 MCP 服务器失败')
}

/**
 * 删除 MCP 服务器
 */
export async function deleteMCPServer(id: string): Promise<void> {
  const response = await fetch(buildUrl(`/mcp/servers/${id}`), {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse<void>(response, '删除 MCP 服务器失败')
}

/**
 * MCP 工具信息
 */
export interface MCPTool {
  name: string
  description: string
}

/**
 * 获取 MCP 服务器的工具列表
 */
export async function getMCPServerTools(id: string): Promise<MCPTool[]> {
  const response = await fetch(buildUrl(`/mcp/servers/${id}/tools`), {
    headers: getHeaders()
  })
  return handleResponse<MCPTool[]>(response, '获取工具列表失败')
}
