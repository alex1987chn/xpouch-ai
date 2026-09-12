/**
 * AboutSection - 设置中心「关于」分区
 *
 * 品牌触点收纳：[XPOUCH] 字标 + slogan + 当前版本 + 开源仓库链接。
 * 品牌图形规范见 docs/design/REDESIGN-NOTES.md（唯一品牌图形=卡片进口袋，
 * 字标为文本形式，禁止自创几何块）。
 */

import { useTranslation } from '@/i18n'
import { VERSION } from '@/constants/ui'
import { GITHUB_REPO_URL } from '@/constants/links'
import { GithubMark } from '@/components/common/GithubMark'

export function AboutSection() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
      {/* 品牌块 */}
      <div className="flex flex-col items-center gap-2 rounded-md border border-border-divider bg-surface-page px-6 py-10">
        <div className="font-display text-[22px] font-bold tracking-wide text-content-primary">
          [<span className="text-accent-brand">X</span>POUCH]
        </div>
        <div className="text-[12.5px] italic text-content-muted">initial minds, one pouch</div>
      </div>

      {/* 版本 / 仓库信息行 */}
      <div className="mt-4 divide-y divide-border-divider rounded-md border border-border-divider">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] text-content-secondary">{t('versionLabel')}</span>
          <span className="text-[13px] font-medium text-content-primary">{VERSION.CURRENT}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] text-content-secondary">{t('openSource')}</span>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[13px] font-medium text-content-primary underline-offset-2 transition-colors hover:text-accent-hover hover:underline"
          >
            <GithubMark className="h-3.5 w-3.5" />
            GitHub
          </a>
        </div>
      </div>

      <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-content-muted">
        {t('aboutHint')}
      </p>
    </div>
  )
}
