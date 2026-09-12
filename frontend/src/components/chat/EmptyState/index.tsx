/**
 * 聊天空态组件（新会话引导）
 *
 * [设计] 蓝本首跑空态：品牌口袋标 + 主标题 + 副文案 + 三张引导卡
 * （从模板开始 / 新建专家[admin] / 直接开聊）。垂直居中于对话区上半部。
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rocket, UserPlus, MessageSquare, type LucideIcon } from 'lucide-react'
import { The4DPocketLogo } from '@/components/brand'
import { useTranslation } from '@/i18n'
import { useUserStore } from '@/store/userStore'

interface GuideCard {
  icon: LucideIcon
  label: string
  desc: string
  onClick: () => void
}

export default function ChatEmptyState() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isAdmin = useUserStore(s => s.user?.role) === 'admin'

  const cards = useMemo<GuideCard[]>(() => {
    const list: GuideCard[] = [
      {
        icon: Rocket,
        label: t('emptyCardTemplate'),
        desc: t('emptyCardTemplateDesc'),
        onClick: () => navigate('/library'),
      },
    ]
    if (isAdmin) {
      list.push({
        icon: UserPlus,
        label: t('emptyCardExpert'),
        desc: t('emptyCardExpertDesc'),
        // 直达专家管理分区（不带 tab 会落在默认的系统状态）
        onClick: () => navigate('/admin/console?tab=experts'),
      })
    }
    list.push({
      icon: MessageSquare,
      label: t('emptyCardChat'),
      desc: t('emptyCardChatDesc'),
      onClick: () => {
        // 直接开聊：聚焦输入台
        document.querySelector<HTMLTextAreaElement>('textarea')?.focus()
      },
    })
    return list
  }, [t, navigate, isAdmin])

  return (
    <div className="flex min-h-[52vh] flex-col items-center justify-center py-8 text-center">
      {/* 品牌标：卡片进口袋（卡片=落入的灵感，口袋=无限可能的 AI 收纳） */}
      <div className="flex h-[42px] w-[42px] items-center justify-center">
        <The4DPocketLogo />
      </div>
      <h2 className="mt-4 text-lg font-bold text-content-primary">
        {t('emptyTitle')}
      </h2>
      <p className="mt-1.5 text-[13px] text-content-muted">
        {t('emptySub')}
      </p>

      {/* 引导三卡（蓝本 empty-cards） */}
      <div className="mt-7 flex flex-wrap items-stretch justify-center gap-3.5 px-2">
        {cards.map(({ icon: Icon, label, desc, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex w-[180px] flex-col items-center gap-2 rounded-lg border border-border-divider bg-surface-card px-4 py-5 transition-all hover:-translate-y-px hover:shadow-theme-card"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-tint">
              <Icon className="h-4 w-4 text-content-secondary" />
            </span>
            <span className="text-[13px] font-bold text-content-primary">{label}</span>
            <span className="text-[11.5px] leading-relaxed text-content-muted">{desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
