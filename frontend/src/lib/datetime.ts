/**
 * 日期展示共享工具
 *
 * [约定·2026-09-22 aware 化] 后端全链路 aware UTC：timestamptz 列 +
 * utc_now() 写入，API 返回的 ISO 字符串一律带时区后缀（+00:00），
 * parseISO/new Date 直接解析为真实时刻，再由 date-fns 以本地时区展示。
 *
 * 历史教训：naive 时代（v3.4.4~v3.5.4）曾需在此补 Z 解析；更早曾对
 * naive 叠加 getTimezoneOffset，UTC+8 下会话时间显示成"16 小时前"。
 */

import { parseISO } from 'date-fns'
import { zhCN, enUS, ja, type Locale } from 'date-fns/locale'
import type { Language } from '@/i18n'

export type { Locale }

/** 后端 ISO 字符串（aware，带 +00:00）→ 真实时刻的 Date */
export function toLocalDate(iso: string): Date {
  return parseISO(iso)
}

/** i18n 语言 → date-fns Locale（formatDistanceToNow 等的本地化） */
export function localeForLanguage(language: Language): Locale {
  return language === 'en' ? enUS : language === 'ja' ? ja : zhCN
}
