/**
 * NotFoundRedirect —— 未知路径的落点（挂在路由表 `path:'*'`）。
 *
 * [行为] 仍然回工作台：用户宁可落在一个能干活的地方，也不要一个 404 页。
 * [为什么要单独写一个组件] 此前这里是裸的 `<Navigate to="/" replace />`——**不留任何痕迹**，
 * 于是任何坏链接、拼错的路径、已下线的老路由都会悄无声息地变成「打开怎么是首页」。
 * 2026-09-13 排查用户报的「点会话记录打开都是首页」时，这条放大器让现象完全无法归因。
 * 现在至少日志里有一条，下次同类现象能一眼分清「真回首页」与「路径根本没匹配上」。
 *
 * 副作用放 effect（不在 render 期打日志），沿用 AdminRoute 的教训。
 */

import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { logger } from '@/utils/logger'

export function NotFoundRedirect() {
  const location = useLocation()
  const target = `${location.pathname}${location.search}`

  useEffect(() => {
    logger.warn('[Router] 未知路径，已回工作台:', target)
  }, [target])

  return <Navigate to="/" replace />
}
