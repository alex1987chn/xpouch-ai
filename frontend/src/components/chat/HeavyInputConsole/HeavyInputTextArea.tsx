/**
 * 重型输入文本域
 * 带行号的工业终端风格文本输入
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
      className="flex-1 bg-transparent border-none p-4 font-mono text-sm focus:ring-0 outline-none resize-none leading-relaxed placeholder:text-primary/40 disabled:opacity-50"
      rows={3}
    />
  )
}
