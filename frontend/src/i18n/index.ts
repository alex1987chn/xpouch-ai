import React, { createContext, useContext, useState, useEffect } from 'react'
import { zh, en, ja } from './translations/index'

export type Language = 'zh' | 'en' | 'ja'

// TranslationKey 由 zh 词条对象派生（单一真相源，替代手工联合——
// 手工维护已三次撞坑：双处定义覆盖/大写装饰/漏键）。
import type { TranslationKeys as TranslationKey } from './translations/index'
export type { TranslationKeys as TranslationKey } from './translations/index'

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey, params?: Record<string, number | string>) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

// 当前语言的模块级镜像：供 SSE handlers 等非 React 环境使用。
// Provider 渲染时同步维护，初始 zh（localStorage 缺省时与 Provider 初始态一致）。
let currentLanguage: Language = 'zh'

function translate(key: TranslationKey, params?: Record<string, number | string>): string {
  const translations = currentLanguage === 'zh' ? zh : currentLanguage === 'ja' ? ja : en
  let text = translations[key] || key
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replace(new RegExp(`{${paramKey}}`, 'g'), String(value))
    })
  }
  return text
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    // 1. 优先从 localStorage 读取
    const saved = localStorage.getItem('language')
    if (saved && ['zh', 'en', 'ja'].includes(saved)) {
      return saved as Language
    }

    // 2. 自动检测系统/浏览器语言
    const browserLang = navigator.language || navigator.languages?.[0] || 'en'

    // 3. 匹配支持的语言
    if (browserLang.startsWith('zh')) return 'zh' // 中文（简体/繁体）
    if (browserLang.startsWith('ja')) return 'ja' // 日语
    if (browserLang.startsWith('en')) return 'en' // 英语

    // 4. 默认中文
    return 'zh'
  })

  // 模块级镜像与 React 态保持同步（handlers 读这里）
  currentLanguage = language

  useEffect(() => {
    localStorage.setItem('language', language)
    document.documentElement.lang = language
  }, [language])

  const t = (key: TranslationKey, params?: Record<string, number | string>) =>
    translate(key, params)

  return React.createElement(
    I18nContext.Provider,
    { value: { language, setLanguage, t } },
    children
  )
}

/** 非 React 环境的翻译入口（SSE handlers 等），跟随当前语言 */
export { translate as t }

export function useTranslation(): I18nContextType {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider')
  }
  return context
}
