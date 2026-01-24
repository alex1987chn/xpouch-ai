import React, { createContext, useContext, useState, useEffect } from 'react'
import { zh, en, ja } from './translations'

export type Language = 'zh' | 'en' | 'ja'

// 更新 TranslationKey 类型定义以包含所有键
export type TranslationKey =
  | 'newChat' | 'history' | 'knowledgeBase' | 'settings' | 'home' | 'recentChats'
  | 'greeting' | 'slogan' | 'placeholder' | 'featuredAgents' | 'myAgents' | 'createAgent' | 'backToChat'
  | 'addCustomAgent' | 'createYourFirstAgent'
  | 'theme' | 'language' | 'systemSettings' | 'userSettings' | 'personalSettings' | 'modelConfig'
  | 'save' | 'cancel' | 'delete' | 'edit' | 'confirmDelete' | 'noHistory' | 'startChat'
  | 'totalHistory' | 'totalItems' | 'matchingHistory' | 'matchingItems' | 'searchHistory'
  | 'noMatchingHistory' | 'tryOtherKeywords'
  | 'create' | 'agentName' | 'agentNamePlaceholder' | 'description' | 'descriptionPlaceholder'
  | 'systemPrompt' | 'systemPromptPlaceholder' | 'systemPromptHint' | 'required'
  | 'startConversation'
  | 'newKnowledgeBase' | 'searchKnowledge' | 'documents' | 'uploadDocument'
  | 'noKnowledgeFound' | 'noKnowledgeContent' | 'createFirstKnowledge'
  | 'currentPlan'
  // Input & Chat
  | 'uploadImage' | 'uploadAttachment' | 'simpleMode' | 'complexMode' | 'simple' | 'complex'
  | 'stop' | 'send' | 'enterToSend' | 'describeTask'
  // Chat Actions
  | 'copy' | 'regenerate' | 'resend'
  // Expert Status
  | 'taskDescription' | 'clear' | 'expertWorkflowDetails' | 'searchExpert' | 'analyzerExpert' | 'frontendExpert'
  | 'pending' | 'running' | 'completed'
  // Delete Dialog
  | 'confirmDeleteTitle' | 'confirmDeleteDescription' | 'deleting'
  // Create Agent Page
  | 'simpleDescription' | 'defineBehavior' | 'writingAssistantPlaceholder' | 'tip' | 'tipDescription'
  | 'realtimePreview' | 'previewDescription' | 'submitTaskPlaceholder'
  // Workflow Steps (Expert Drawer)
  | 'receiveTask' | 'receiveTaskDesc' | 'buildQuery' | 'buildQueryDesc' | 'executeSearch' | 'executeSearchDesc'
  | 'analyzeData' | 'analyzeDataDesc' | 'generateReport' | 'generateReportDesc' | 'designUI' | 'designUIDesc'

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
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
