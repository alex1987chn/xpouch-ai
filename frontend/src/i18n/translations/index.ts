import { TranslationKey } from '../index'

// 导入各模块翻译
import * as common from './common'
import * as home from './home'
import * as chat from './chat'
import * as library from './library'
import * as admin from './admin'
import * as settings from './settings'

// 合并所有中文翻译
export const zh: Record<TranslationKey, string> = {
  ...common.zh,
  ...home.zh,
  ...chat.zh,
  ...library.zh,
  ...admin.zh,
  ...settings.zh,
} as Record<TranslationKey, string>

// 合并所有英文翻译
export const en: Record<TranslationKey, string> = {
  ...common.en,
  ...home.en,
  ...chat.en,
  ...library.en,
  ...admin.en,
  ...settings.en,
} as Record<TranslationKey, string>

// 合并所有日文翻译
export const ja: Record<TranslationKey, string> = {
  ...common.ja,
  ...home.ja,
  ...chat.ja,
  ...library.ja,
  ...admin.ja,
  ...settings.ja,
} as Record<TranslationKey, string>

// 导出各模块（用于需要按需加载的场景）
export { common, home, chat, library, admin, settings }
