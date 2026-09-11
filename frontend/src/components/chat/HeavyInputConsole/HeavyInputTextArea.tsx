/**
 * 重型输入文本域
 * 输入台卡片内的多行文本输入（柔和材质）
 */

import { useTranslation } from '@/i18n'
import type { HeavyInputTextAreaProps } from '../types'

export default function HeavyInputTextArea({
  value,
  onChange,
  onKeyDown,
  disabled,
}: HeavyInputTextAreaProps) {
  const { t } = useTranslation()

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      placeholder={t('inputPlaceholder')}
      className="field-sizing-content max-h-48 min-h-[34px] flex-1 resize-none self-center overflow-y-auto border-none bg-transparent px-1 py-[6px] text-[13.5px] leading-[1.6] text-content-primary outline-none ring-0 placeholder:text-content-muted disabled:opacity-50"
      rows={1}
    />
  )
}
