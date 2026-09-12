// 导入各模块翻译
import * as common from './common'
import * as home from './home'
import * as chat from './chat'
import * as library from './library'
import * as admin from './admin'
import * as settings from './settings'
import * as run from './run'
import * as workbench from './workbench'

// 合并所有中文翻译（键类型由此派生——TranslationKey 单一真相源）
export const zh = {
  ...common.zh,
  ...home.zh,
  ...chat.zh,
  ...library.zh,
  ...admin.zh,
  ...settings.zh,
  ...run.zh,
  ...workbench.zh,
}

// 键集合由 zh 派生：en/ja 缺键 = 编译期报错（替代人工同步）
export type TranslationKeys = keyof typeof zh

// 合并所有英文翻译
export const en: Record<TranslationKeys, string> = {
  ...common.en,
  ...home.en,
  ...chat.en,
  ...library.en,
  ...admin.en,
  ...settings.en,
  ...run.en,
  ...workbench.en,
}

// 合并所有日文翻译
export const ja: Record<TranslationKeys, string> = {
  ...common.ja,
  ...home.ja,
  ...chat.ja,
  ...library.ja,
  ...admin.ja,
  ...settings.ja,
  ...run.ja,
  ...workbench.ja,
}

// 导出各模块（用于需要按按需加载的场景）
export { common, home, chat, library, admin, settings, run, workbench }
