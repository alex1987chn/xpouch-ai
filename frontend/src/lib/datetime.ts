/**
 * 日期展示共享工具
 *
 * [约定·2026-09-12 定稿] 后端所有时间戳统一为 **UTC naive** 写入
 * （模型默认值与服务层均 utc_now_naive，见 REDESIGN-NOTES 增补 7），
 * API 返回的 ISO 字符串无时区后缀 → 前端一律按 UTC 解析为真实时刻，
 * 再由 date-fns 以本地时区展示。
 *
 * 历史教训：此前前端对 naive 再叠加 getTimezoneOffset 偏移，
 * UTC+8 环境下会话时间显示成"16 小时前"（双重偏移）。
 */

import { parseISO } from 'date-fns'
import { zhCN, enUS, ja, type Locale } from 'date-fns/locale'
import type { Language } from '@/i18n'

export type { Locale }

/** 后端 ISO 字符串 → 真实时刻的 Date（naive 视为 UTC；带时区后缀则原样解析） */
export function toLocalDate(iso: string): Date {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)
  return parseISO(hasTimezone ? iso : `${iso}Z`)
}

/** i18n 语言 → date-fns Locale（formatDistanceToNow 等的本地化） */
export function localeForLanguage(language: Language): Locale {
  return language === 'en' ? enUS : language === 'ja' ? ja : zhCN
}
