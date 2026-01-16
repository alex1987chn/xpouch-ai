import React, { createContext, useContext, useState, useEffect } from 'react'
import { zh, en, ja } from './translations'

export type Language = 'zh' | 'en' | 'ja'

// 更新 TranslationKey 类型定义以包含所有键
export type TranslationKey = 
  | 'newChat' | 'history' | 'knowledgeBase' | 'settings' | 'home'
  | 'greeting' | 'slogan' | 'placeholder' | 'featuredAgents' | 'myAgents' | 'createAgent' | 'backToChat'
  | 'theme' | 'language' | 'systemSettings' | 'userSettings' | 'personalSettings' | 'modelConfig'
  | 'save' | 'cancel' | 'delete' | 'edit' | 'confirmDelete' | 'noHistory' | 'startChat'
  | 'create' | 'agentName' | 'description' | 'systemPrompt'
  | 'startConversation'
  | 'newKnowledgeBase' | 'searchKnowledge' | 'documents' | 'uploadDocument'
  | 'noKnowledgeFound' | 'noKnowledgeContent' | 'createFirstKnowledge'
  | 'currentPlan'

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language')
    return (saved as Language) || 'zh'
  })

  useEffect(() => {
    localStorage.setItem('language', language)
    document.documentElement.lang = language
  }, [language])

  const t = (key: TranslationKey) => {
    const translations = language === 'zh' ? zh : language === 'ja' ? ja : en
    return translations[key] || key
  }

  return React.createElement(
    I18nContext.Provider,
    { value: { language, setLanguage, t } },
    children
  )
}

export function useTranslation() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider')
  }
  return context
}
