/**
 * =============================
 * Models Query Hook
 * =============================
 *
 * 可用模型列表（单一真相源：GET /api/models，来自后端 providers.yaml）
 *
 * [配置说明]
 * - staleTime: 10分钟，模型列表随服务端 providers.yaml 变化
 * - gcTime: 30分钟
 */

import { useQuery } from '@tanstack/react-query'
import { getAvailableModels } from '@/services/models'
import { CACHE_TIMES } from '@/config/query'

// Query Key 工厂函数
export const modelsKeys = {
  all: ['models'] as const,
  list: () => [...modelsKeys.all, 'list'] as const,
}

// 获取可用模型列表的 Query Hook
export function useModelsQuery(enabled = true) {
  return useQuery({
    queryKey: modelsKeys.list(),
    queryFn: getAvailableModels,
    enabled,
    staleTime: CACHE_TIMES.MODELS.staleTime,
    gcTime: CACHE_TIMES.MODELS.gcTime,
    retry: 1,
  })
}
