/**
 * 专家显示名解析（**服务端权威值**优先，静态词条兜底）。
 *
 * 顺序与理由见 `lib/expertIdentity.resolveExpertLabel`：名册（系统专家的权威名，
 * 管理员在控制台改名即时生效）→ 静态词条 → 原 expert_type。
 *
 * 名册数据由 React Query 缓存（30 分钟 staleTime），组件直接调用即可，
 * 不会因为多挂几个组件就多打请求。
 */

import { useCallback, useMemo } from 'react'
import { useTranslation } from '@/i18n'
import { useExpertCatalogQuery } from '@/hooks/queries/useExpertCatalogQuery'
import { resolveExpertLabel } from '@/lib/expertIdentity'

/** 返回 `expertType → 显示名` 的解析函数 */
export function useExpertLabel(): (expertType: string) => string {
  const { t } = useTranslation()
  const { data: catalog } = useExpertCatalogQuery()

  const catalogNames = useMemo(
    () => new Map((catalog ?? []).map(item => [item.expert_type, item.name])),
    [catalog]
  )

  return useCallback(
    (expertType: string) => resolveExpertLabel(expertType, { catalogNames }, t),
    [catalogNames, t]
  )
}
