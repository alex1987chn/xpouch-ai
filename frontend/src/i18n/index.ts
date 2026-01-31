import React, { createContext, useContext, useState, useEffect } from 'react'
import { zh, en, ja } from './translations'

export type Language = 'zh' | 'en' | 'ja'

// 更新 TranslationKey 类型定义以包含所有键
export type TranslationKey =
  // Navigation
  | 'newChat' | 'draftSaved' | 'draftRestored' | 'history' | 'knowledgeBase' | 'settings' | 'home' | 'recentChats'
  | 'navDashboard' | 'navExperts' | 'memoryDump' | 'noDataStream'
  // Home
  | 'greeting' | 'slogan' | 'placeholder' | 'featuredAgents' | 'myAgents' | 'createAgent' | 'backToChat'
  | 'addCustomAgent' | 'createYourFirstAgent' | 'statusReady' | 'statusIdle' | 'heroTitle'
  | 'commandInput' | 'initializeNew' | 'online' | 'offline' | 'recommended' | 'myConstructs'
  | 'confirmDeleteAgent' | 'deleteAgentWarning' | 'deleteAgentConfirm' | 'deleteAgentConfirmDesc'
  // Create Agent
  | 'agentName' | 'category' | 'description' | 'systemPrompt' | 'preview' | 'createAgent'
  | 'chars' | 'complete' | 'almost' | 'input' | 'giveName' | 'categoryGeneral' | 'categoryDev'
  | 'categoryCreate' | 'categoryAnalyze' | 'categoryResearch' | 'simpleDescription' | 'defineBehavior'
  | 'writingAssistantPlaceholder' | 'tip' | 'tipDescription' | 'realtimePreview' | 'previewDescription'
  | 'submitTaskPlaceholder' | 'loadFailed' | 'loadExpertFailed' | 'saveSuccess' | 'saveFailed'
  | 'testInputMinCharsError' | 'executionCompleted' | 'previewFailed' | 'refreshSuccess' | 'loading'
  | 'expertsHeader' | 'searchPlaceholder' | 'noMatchExpert' | 'config' | 'editMode' | 'previewMode'
  | 'lastUpdated' | 'modelConfig' | 'temperature' | 'conservative' | 'balanced' | 'creative'
  | 'minChars' | 'saving' | 'saveConfig' | 'testInput' | 'running' | 'startPreview' | 'results'
  | 'model' | 'temp' | 'response' | 'secondsAbbr' | 'temperatureValue' | 'characters' | 'provider'
  // Settings
  | 'theme' | 'language' | 'systemSettings' | 'userSettings' | 'personalSettings' | 'modelConfig'
  // Common
  | 'save' | 'cancel' | 'delete' | 'edit' | 'confirmDelete' | 'noHistory' | 'startChat'
  | 'totalHistory' | 'totalItems' | 'matchingHistory' | 'matchingItems' | 'searchHistory'
  | 'noMatchingHistory' | 'tryOtherKeywords'
  // Create Agent
  | 'create' | 'agentName' | 'agentNamePlaceholder' | 'description' | 'descriptionPlaceholder'
  | 'systemPrompt' | 'systemPromptPlaceholder' | 'systemPromptHint' | 'required'
  // Chat
  | 'startConversation' | 'initConversation'
  // Knowledge Base
  | 'newKnowledgeBase' | 'searchKnowledge' | 'documents' | 'uploadDocument'
  | 'noKnowledgeFound' | 'noKnowledgeContent' | 'createFirstKnowledge'
  // User Menu
  | 'currentPlan' | 'logout'
  // Input & Chat
  | 'uploadImage' | 'uploadAttachment' | 'simpleMode' | 'complexMode' | 'simple' | 'complex'
  | 'stop' | 'send' | 'enterToSend' | 'describeTask' | 'inputPlaceholder' | 'execute' | 'processing'
  // Chat Actions
  | 'copy' | 'copied' | 'regenerate' | 'resend' | 'retry' | 'preview'
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
  // RBAC Expert Admin (v0.6.0)
  | 'expertAdmin' | 'expertsList' | 'refresh' | 'selectExpert' | 'lastUpdated'
  | 'expertKey' | 'model' | 'temperature' | 'temperatureValue' | 'expertSystemPrompt'
  | 'characters' | 'saveConfig' | 'saving' | 'saveSuccess' | 'saveFailed'
  | 'previewMode' | 'editMode' | 'startPreview' | 'previewing' | 'previewFailed'
  | 'testInput' | 'testInputPlaceholder' | 'testInputMinChars' | 'previewSuccess'
  | 'previewResults' | 'usedModel' | 'expertResponse'
  | 'executionTime' | 'seconds' | 'selectExpertPrompt' | 'loadingExperts'
  // Artifact Area
  | 'noArtifacts' | 'clickExpertToView' | 'closePreview'
  // Orchestrator Panel
  | 'overview' | 'ganttViewTitle' | 'noArtifactsTitle' | 'noArtifactsDesc'
  | 'exitFullscreen' | 'openFullscreen' | 'loadingModule'
  // Expert Modal
  | 'taskLogTitle' | 'outputConsole' | 'noOutputAvailable'
  // Personal Settings Dialog
  | 'avatarSetup' | 'uploadAvatar' | 'removeAvatar' | 'avatarHint'
  | 'username' | 'usernamePlaceholder' | 'usernameHint'
  | 'userConfig' | 'savingUserSettings'
  // Settings Dialog (System Config)
  | 'systemConfig' | 'defaultModel' | 'apiKeyConfig' | 'apiKeyConfigTitle'
  | 'apiKeyConfigDesc' | 'apiKeyConfigHint' | 'agentPrompts' | 'customized' | 'defaultPrompt'
  // Thinking Process
  | 'thinking' | 'thinkingSteps' | 'showThinking' | 'hideThinking'


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

export function useTranslation(): I18nContextType {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider')
  }
  return context
}
