/**
 * 内容页标题行习语的统一实现（对齐 docs/design 蓝本 lib-head）。
 *
 * 结构：17px 粗体标题 + 右侧插槽，底部 1px 分隔线。
 * 页面标题内嵌文档流、随页滚动，不使用 fixed header——
 * 「我在哪」的定位由常驻图标栏承担。
 */

import type { ReactNode } from 'react'

interface PageTitleProps {
  title: string
  /** 右侧区域：计数、入口按钮等 */
  right?: ReactNode
}

export default function PageTitle({ title, right }: PageTitleProps) {
  return (
    <div className="flex justify-between items-end border-b border-border-divider pb-3">
      <h1 className="text-[17px] font-bold text-content-primary">
        {title}
      </h1>
      {right}
    </div>
  )
}
