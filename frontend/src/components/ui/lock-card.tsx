/**
 * 权限锁定卡片（DESIGN.md §4.5「可见但锁」）。
 *
 * 产品决策：功能菜单全员可见，数据/操作按角色控制（开源橱窗效应）。
 * 无权限时不渲染裸空态（会被误读为"没有数据"），而是明确告知：
 * 内容存在、当前身份无权访问、需要联系管理员。
 */

import { Lock } from 'lucide-react'
import { useTranslation } from '@/i18n'

interface PermissionLockCardProps {
  /** 锁定标题（缺省用通用「仅管理员」文案） */
  title?: string
  /** 补充说明（角色要求 / 联系方式等） */
  description?: string
}

export function PermissionLockCard({ title, description }: PermissionLockCardProps) {
  const { t } = useTranslation()
  return (
    <div className="border-theme-card border-border-default bg-surface-card px-6 py-16 text-center shadow-theme-card">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-theme-card border-border-default bg-surface-page">
        <Lock className="h-8 w-8 text-content-muted" />
      </div>
      <h3 className="font-mono text-sm font-bold text-content-primary">
        {title || t('adminOnly')}
      </h3>
      {description && <p className="mt-2 text-xs text-content-secondary">{description}</p>}
    </div>
  )
}
