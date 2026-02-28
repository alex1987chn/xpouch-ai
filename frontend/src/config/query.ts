/**
 * =============================
 * Query Client 缓存配置
 * =============================
 *
 * 统一的缓存时间常量，用于全局 QueryClient 配置和单个 query hooks
 * 避免缓存配置不一致的问题
 */

export const CACHE_TIMES = {
  // 智能体列表 - 变化不频繁，缓存30分钟
  AGENTS: { staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000 },

  // 聊天历史 - 可能经常变化，缓存5分钟
  CHAT_HISTORY: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 },

  // MCP 服务器 - 变化不频繁，缓存5分钟
  MCP_SERVERS: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 },

  // 用户信息 - 缓存30分钟
  USER: { staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000 },

  // 聊天会话详情 - 变化较频繁，缓存2分钟
  CHAT_SESSION: { staleTime: 2 * 60 * 1000, gcTime: 5 * 60 * 1000 },

  // MCP 服务器工具列表 - 可能实时变化，缓存1分钟
  MCP_TOOLS: { staleTime: 60 * 1000, gcTime: 5 * 60 * 1000 },
} as const

// 默认缓存配置（用于全局 QueryClient）
export const DEFAULT_CACHE_CONFIG = {
  staleTime: CACHE_TIMES.CHAT_HISTORY.staleTime,
  gcTime: CACHE_TIMES.CHAT_HISTORY.gcTime,
} as const
