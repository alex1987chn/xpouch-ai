/**
 * 内容页标题行习语的统一实现（DESIGN.md §4.1）。
 *
 * 结构：色块 + /// + 大写标题 + 右侧插槽，底部 2px 划线。
 * 页面标题一律内嵌文档流、随页滚动，不使用 fixed header——
 * 「我在哪」的定位由常驻侧边栏承担。
 */

import type { ReactNode } from 'react'

interface PageTitleProps {
  title: string
  /** 右侧区域：计数、入口按钮等 */
  right?: ReactNode
}

export default function PageTitle({ title, right }: PageTitleProps) {
  return (
    <div className="flex justify-between items-end border-b-2 border-border pb-2">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-accent-brand" />
        <span className="font-mono text-content-muted">///</span>
        <h1 className="text-xl font-black tracking-widest text-content-primary">
          {title}
        </h1>
      </div>
      {right}
    </div>
  )
}
