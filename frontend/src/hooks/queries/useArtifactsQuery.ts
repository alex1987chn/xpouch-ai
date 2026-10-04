/**
 * =============================
 * Artifacts Query Hook
 * =============================
 *
 * 产物中心：跨会话产物画廊（无限查询，单一真相源 GET /api/artifacts）
 * threadId 维度供工作台产物画布使用（当前会话的产物投影）
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { listArtifacts } from '@/services/artifacts'

export const artifactsKeys = {
  all: ['artifacts'] as const,
  /** 跨会话画廊（无限查询；type/search 变化即换 key 重查） */
  gallery: (type?: string, search?: string) =>
    [...artifactsKeys.all, 'gallery', type ?? 'all', search ?? ''] as const,
  /** 按线程过滤的列表（工作台画布） */
  threadList: (threadId: string) =>
    [...artifactsKeys.all, 'threadList', threadId] as const,
}

/**
 * 跨会话产物画廊（无限滚动，镜像会话列表 useChatHistoryQuery 的模式）。
 *
 * 此前组件硬编码第 1 页（20/24 条封顶），用户 83 个产物只能看到
 * 24 个——「数量不对」的根因（2026-10-05 用户实测报出）。
 */
export function useArtifactsQuery(type?: string, search?: string) {
  return useInfiniteQuery({
    queryKey: artifactsKeys.gallery(type, search),
    queryFn: ({ pageParam = 1 }) => listArtifacts({ page: pageParam, limit: 24, type, search }),
    getNextPageParam: lastPage => (lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
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
