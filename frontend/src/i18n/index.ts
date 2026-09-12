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

  useEffect(() => {
    localStorage.setItem('language', language)
    document.documentElement.lang = language
  }, [language])

  const t = (key: TranslationKey, params?: Record<string, number | string>) => {
    const translations = language === 'zh' ? zh : language === 'ja' ? ja : en
    let text = translations[key] || key
    
    // 支持参数插值，如 {count}
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        text = text.replace(new RegExp(`{${paramKey}}`, 'g'), String(value))
      })
    }
    
    return text
  }

  return React.createElement(
    I18nContext.Provider,
    { value: { language, setLanguage, t } },
    children
  )
}

export function useTranslation(): I18nContextType {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider')
  }
  return context
}
