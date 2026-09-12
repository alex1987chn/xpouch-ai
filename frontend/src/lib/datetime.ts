/**
 * 日期展示共享工具
 *
 * [背景] 后端 Message/Artifact 等表落库 naive UTC 时间戳，前端列表展示
 * "相对时间"时需要统一的解读约定：naive 字符串按 UTC 解读后再以本地墙钟展示。
 * 此约定与 HistoryPage/SessionStrata 既有行为一致，禁止各组件自行换算。
 */

import { parseISO } from 'date-fns'
import { zhCN, enUS, ja, type Locale } from 'date-fns/locale'
import type { Language } from '@/i18n'

export type { Locale }

/** naive UTC ISO → 展示用 Date（会话地层/产物画布/详情弹框共用） */
export function toLocalDate(iso: string): Date {
  const parsed = parseISO(iso)
  return new Date(parsed.getTime() + parsed.getTimezoneOffset() * 60_000)
}

/** i18n 语言 → date-fns Locale（formatDistanceToNow 等的本地化） */
export function localeForLanguage(language: Language): Locale {
  return language === 'en' ? enUS : language === 'ja' ? ja : zhCN
}
