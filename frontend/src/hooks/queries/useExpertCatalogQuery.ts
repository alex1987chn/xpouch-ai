/**
 * 专家名册查询（`GET /experts/catalog`）。
 *
 * 与专家列表（`useAgentsQuery`，只含自定义智能体）互补：名册给的是**系统专家**的权威显示名。
 * staleTime 与 AGENTS 同档（30 分钟）——专家改名是低频操作，任务界面不该为此频繁打请求。
 */

import { useQuery } from '@tanstack/react-query'

import { getExpertCatalog, type ExpertCatalogItem } from '@/services/experts'
import { CACHE_TIMES } from '@/config/query'

export const expertCatalogKeys = {
  all: ['expertCatalog'] as const,
}

export function useExpertCatalogQuery(enabled = true) {
  return useQuery<ExpertCatalogItem[]>({
    queryKey: expertCatalogKeys.all,
    queryFn: getExpertCatalog,
    staleTime: CACHE_TIMES.AGENTS.staleTime,
    gcTime: CACHE_TIMES.AGENTS.gcTime,
    refetchOnWindowFocus: false,
    enabled,
  })
}
