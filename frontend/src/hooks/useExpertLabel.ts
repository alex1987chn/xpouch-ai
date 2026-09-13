/**
 * 专家显示名解析（**运行时**优先，静态表兜底）。
 *
 * 为什么不能只靠静态词条：专家名在库里（`systemexpert.name`），管理员可以在控制台改名
 * （例如 aggregator 的显示名是「首席联络官」而不是字面的"聚合器"），自定义专家的名字
 * 更是每个部署都不一样。静态表（lib/expertIdentity.EXPERT_TYPE_LABEL_KEY）只覆盖
 * 系统内置的常用键，且是**可能漂移**的一份副本——所以顺序是：
 *
 *   1. 自定义专家列表（GET /agents，任意用户可读）里的 name —— 按 id 命中
 *   2. 系统专家静态词条（t 出来的中文名）
 *   3. 原样返回 expert_type（至少不显示空白）
 *
 * [已知缺口] 系统专家的**改名**仍读不到：`GET /admin/experts` 是管理员端点，普通用户
 * 拿不到；彻底解决要把显示名随 `task.started` 事件下发（协议加字段）。记在
 * docs/TARGET-ARCHITECTURE.md 的待办里，别再用第四份映射去补。
 */

import { useCallback, useMemo } from 'react'
import { useTranslation } from '@/i18n'
import { useAgentsQuery } from '@/hooks/queries/useAgentsQuery'
import { expertLabel } from '@/lib/expertIdentity'

/**
 * 返回 `expertType → 显示名` 的解析函数。
 *
 * 组件直接调用即可（agent 列表由 React Query 缓存，30 分钟 staleTime，不会反复请求）。
 */
export function useExpertLabel(): (expertType: string) => string {
  const { t } = useTranslation()
  const { data } = useAgentsQuery({ includeDefault: false })

  const namesById = useMemo(
    () => new Map((data ?? []).map(agent => [agent.id, agent.name])),
    [data]
  )

  return useCallback(
    (expertType: string) => namesById.get(expertType) || expertLabel(expertType, t),
    [namesById, t]
  )
}
