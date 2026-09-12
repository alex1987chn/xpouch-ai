/**
 * =============================
 * Artifacts Query Hook
 * =============================
 *
 * 产物中心：跨会话产物分页列表（单一真相源 GET /api/artifacts）
 * threadId 维度供工作台产物画布使用（当前会话的产物投影）
 */

import { useQuery } from '@tanstack/react-query'
import { listArtifacts } from '@/services/artifacts'

export const artifactsKeys = {
  all: ['artifacts'] as const,
  list: (page: number, type?: string, search?: string) =>
    [...artifactsKeys.all, 'list', page, type ?? 'all', search ?? ''] as const,
  /** 按线程过滤的列表（工作台画布） */
  threadList: (threadId: string) =>
    [...artifactsKeys.all, 'threadList', threadId] as const,
}

export function useArtifactsQuery(page: number, type?: string, search?: string) {
  return useQuery({
    queryKey: artifactsKeys.list(page, type, search),
    queryFn: () => listArtifacts({ page, limit: 24, type, search }),
    staleTime: 30_000,
    retry: 1,
  })
}

/** 当前线程的产物列表（工作台右栏；新会话无 threadId 时禁用） */
export function useThreadArtifactsQuery(threadId: string | null) {
  return useQuery({
    queryKey: artifactsKeys.threadList(threadId ?? 'none'),
    queryFn: () => listArtifacts({ threadId: threadId!, limit: 50 }),
    enabled: !!threadId,
    staleTime: 15_000,
    retry: 1,
  })
}
