/**
 * =============================
 * Artifacts Query Hook
 * =============================
 *
 * 产物中心：跨会话产物分页列表（单一真相源 GET /api/artifacts）
 */

import { useQuery } from '@tanstack/react-query'
import { listArtifacts } from '@/services/artifacts'

export const artifactsKeys = {
  all: ['artifacts'] as const,
  list: (page: number, type?: string) =>
    [...artifactsKeys.all, 'list', page, type ?? 'all'] as const,
}

export function useArtifactsQuery(page: number, type?: string) {
  return useQuery({
    queryKey: artifactsKeys.list(page, type),
    queryFn: () => listArtifacts({ page, limit: 24, type }),
    staleTime: 30_000,
    retry: 1,
  })
}
