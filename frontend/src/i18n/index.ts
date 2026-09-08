import React, { createContext, useContext, useState, useEffect } from 'react'
import { zh, en, ja } from './translations/index'

export type Language = 'zh' | 'en' | 'ja'

// 更新 TranslationKey 类型定义以包含所有键
export type TranslationKey =
  // Navigation
  | 'newChat' | 'draftSaved' | 'draftRestored' | 'history' | 'knowledgeBase' | 'library' | 'workshop' | 'settings' | 'home' | 'recentChats'
  | 'navDashboard' | 'navExperts' | 'navStats' | 'memoryDump' | 'noDataStream'
  // Home
  | 'greeting' | 'slogan' | 'placeholder' | 'featuredAgents' | 'myAgents' | 'createAgent' | 'editAgent' | 'backToChat'
  | 'addCustomAgent' | 'createYourFirstAgent' | 'statusReady' | 'statusIdle' | 'heroTitle'
  | 'commandInput' | 'initializeNew' | 'online' | 'offline' | 'recommended' | 'myConstructs'
  | 'sceneLiveBadge'
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
  | 'simpleMode' | 'followSystemDefault' | 'thinkingMode' | 'thinkingAuto' | 'thinkingOn' | 'thinkingOff'
  | 'thinkingUnsupported' | 'thinkingCostHint' | 'complexMode' | 'complexModeDesc'
  | 'modelsLoading' | 'modelsLoadFailed' | 'openSource'
  // Common
  | 'save' | 'cancel' | 'delete' | 'edit' | 'confirmDelete' | 'noHistory' | 'startChat'
  | 'menu' | 'image'
  // Run 时间线/详情
  | 'modeLabel' | 'modeComplex' | 'modeSimple' | 'modeComplexShort' | 'modeSimpleShort'
  | 'expertLabel' | 'durationLabel' | 'artifactTypeLabel' | 'hitlWaitingApproval'
  | 'runCreatedAt' | 'runBack' | 'runDetails' | 'runNotFound' | 'noEvents'
  | 'payloadEmpty' | 'selectEventHint'
  // 计划审核
  | 'planReviewTitle' | 'tasksPendingConfirm'
  // Artifact 加载态
  | 'artifactChartGenerating' | 'artifactMermaidGenerating' | 'artifactDataError'
  | 'artifactHtmlTruncated'
  | 'videoLoading' | 'videoLoadFailed' | 'imageLoading' | 'imageLoadFailed'
  | 'mediaLinkInvalid' | 'artifactSchemaHintPlaceholder'
  // 登录弹窗
  | 'phoneNumberPlaceholder' | 'autoRegisterHint' | 'codePlaceholder' | 'codeSentTo' | 'changePhone'
  // UID 复制
  | 'uidCopied' | 'clickToCopyUid'
  // 既有翻译但此前缺席联合的键（v3.4.4 补全，t() 恢复类型安全）
  | 'operationFailed' | 'sending' | 'complexTaskCompleted' | 'taskPlan' | 'aiAssistant'
  | 'commander' | 'searchExpertName' | 'codingExpert' | 'researchExpert' | 'analyzerExpertName'
  | 'writingExpert' | 'planningExpert' | 'imageAnalyzerExpert'
  | 'toolSearchDesc' | 'toolReadWebpageDesc' | 'toolCalculatorDesc' | 'toolTimeDesc' | 'toolMcpDesc'
  // 此前声明无翻译的幽灵键（v3.4.4 补三语）
  | 'resend' | 'editExpert' | 'loadExpertsFailed' | 'noData' | 'noToolPoliciesFound'
  | 'totalHistory' | 'totalItems' | 'matchingHistory' | 'matchingItems' | 'searchHistory'
  | 'noMatchingHistory' | 'tryOtherKeywords'
  // Create Agent
  | 'create' | 'agentName' | 'agentNamePlaceholder' | 'description' | 'descriptionPlaceholder'
  | 'systemPrompt' | 'systemPromptPlaceholder' | 'systemPromptHint' | 'required'
  // Chat
  | 'startConversation' | 'initConversation' | 'analyzingRequestStream'
  // Knowledge Base & MCP
  | 'newKnowledgeBase' | 'searchKnowledge' | 'documents' | 'uploadDocument'
  | 'noKnowledgeFound' | 'noKnowledgeContent' | 'createFirstKnowledge'
  | 'searchMCPServers' | 'noMCPServers' | 'noMatchingServers' | 'clickAddToConnect'
  | 'mcpTools' | 'addModule' | 'mcpDescriptionPlaceholder' | 'confirmDeleteMCPServer' | 'removed' | 'deleteFailed'
  | 'transport' | 'transportProtocol' | 'transportSSE' | 'transportStreamableHTTP'
  | 'toggleFailed' | 'noDescription' | 'disable' | 'enable' | 'moduleName' | 'sseUrl'
  | 'sseUrlHint' | 'connecting' | 'initializeModule' | 'mcpServerAdded' | 'failedToAddServer'
  | 'validationError' | 'nameAndUrlRequired' | 'matching' | 'knowledgeBaseDescription'
  | 'add' | 'deleted' | 'error' | 'success' | 'optional' | 'serverNamePlaceholder' | 'availableTools' | 'noToolsAvailable' | 'serverNotConnected' | 'serverDisabled' | 'failedToLoadTools'
  | 'searchTemplates' | 'searchTools' | 'skillTemplates' | 'newTemplate' | 'templateRequiredFields'
  | 'artifactsTitle' | 'artifactsTotalSuffix' | 'artifactsEmpty'
  | 'artifactsFilterAll' | 'artifactsFilterCode' | 'artifactsFilterHtml'
  | 'artifactsFilterMarkdown' | 'artifactsFilterReport' | 'artifactsFilterImage'
  | 'artifactShareAction' | 'artifactShareCopied' | 'widthExpand' | 'widthNarrow'
  | 'templateSaved' | 'templateDeleted' | 'templateNoDescription' | 'noTemplatesFound'
  | 'templateDetail' | 'createTemplate' | 'templateEditorHint' | 'useTemplate' | 'templateKey'
  | 'recommendedMode' | 'templateDescription' | 'starterPrompt' | 'systemHint'
  | 'suggestedTags' | 'toolHints' | 'templateActive' | 'templateReadonlyHint'
  | 'builtinTemplateCannotDelete' | 'toolGovernance' | 'governanceAdminOnly'
  | 'approvalRequired' | 'autoAllowed' | 'riskTier' | 'riskLow' | 'riskMedium' | 'riskHigh'
  | 'enabled' | 'disabled' | 'source' | 'allowedExperts' | 'blockedExperts'
  | 'policyNote' | 'policySaved' | 'savePolicy' | 'noToolPolicySelected' | 'saved'
  | 'comingSoon'
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
  // Cancel Dialog
  | 'confirmCancelTitle' | 'confirmCancelDescription' | 'canceling' | 'confirmCancel'
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
  // Expert Description (v0.7.0)
  | 'expertDescription' | 'expertDescriptionPlaceholder' | 'expertDescriptionTooltip'
  | 'autoGenerate' | 'autoGenerateDescriptionTooltip' | 'generating'
  | 'descriptionGenerated' | 'generateDescriptionFailed' | 'systemPromptTooShort'
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
  // Dynamic Expert (v3.0)
  | 'newExpert' | 'createExpert' | 'deleteExpert' | 'confirmDeleteExpert' | 'deleteExpertWarning'
  | 'expertKeyPlaceholder' | 'expertKeyHint' | 'expertKeyExists' | 'invalidExpertKey'
  | 'namePlaceholder' | 'creating' | 'createSuccess' | 'createFailed'
  | 'deleteSuccess' | 'deleteFailed' | 'cannotDeleteSystemExpert'
  // Validation
  | 'uploadImageFile' | 'usernameRequired' | 'usernameMinLength' | 'usernameMaxLength'
  | 'imageSizeExceeded' | 'imageProcessFailed' | 'saveFailedLater' | 'updateFailedLater'
  // Auth & Permission
  | 'permissionDenied' | 'adminOnly' | 'readOnly' | 'login'
  // 密码登录（v3.4.4）
  | 'loginTabOtp' | 'passwordLoginTab' | 'identifierLabel' | 'identifierPlaceholder'
  | 'passwordPlaceholder' | 'accountAndPasswordRequired' | 'passwordLoginHint'
  | 'passwordSetup' | 'oldPasswordPlaceholder' | 'newPasswordPlaceholder'
  | 'passwordSetupHint' | 'passwordSaveLabel' | 'passwordMinLength'
  | 'oldPasswordRequired' | 'passwordSaved'
  | 'newPasswordLabel' | 'forgotPasswordLink' | 'resetPasswordTitle' | 'resetPasswordAction'
  | 'resetSendHint' | 'passwordResetSuccess' | 'backToLogin'
  | 'openSourceThread'
  | 'usageLabel' | 'usageToday' | 'usageTotal'
  // Time & General
  | 'justNow' | 'secondsAgo' | 'general'
  // Language selector
  | 'langZh' | 'langEn' | 'langJa'
  // Sidebar
  | 'expandSidebar' | 'collapseSidebar'
  // Default Agent & Messages
  | 'defaultAgentDescription' | 'sendingPendingMessage'
  // Batch Delete
  | 'select' | 'selectAll' | 'deselectAll' | 'selectedCount' | 'batchDelete' | 'batchDeleteConfirm'
  | 'moreAvailable' | 'loadMore' | 'noMoreRecords'
  // StatsPage
  | 'globalStats' | 'myStats' | 'totalRuns' | 'successRate' | 'hitlCount' | 'avgDuration'
  | 'trends' | 'days' | 'noRuns' | 'runList' | 'prev' | 'next' | 'viewDetails' | 'loadFailed' | 'failed'
  // Polling (轮询恢复)
  | 'pollingRestoring' | 'pollingHitlPaused' | 'pollingRefresh' | 'pollingError'
  // 历史遗漏键补齐（2026-09 tsc 清零：译文已存在于字典，仅缺联合类型声明）
  | 'artifactSchemaHint' | 'attachment' | 'browseFiles' | 'builtinTemplate' | 'clone'
  | 'cloneDescription' | 'close' | 'codePreview' | 'confirmDeleteTemplate' | 'createAgentDesc'
  | 'customTemplate' | 'deleteTask' | 'detectingComplexTask' | 'dragAndDropJson' | 'editExpert'
  | 'enterCode' | 'enterValidPhone' | 'exampleAiResponseNoPrompt' | 'exampleAiResponseWithPrompt' | 'exampleChat'
  | 'exampleUserMessage' | 'existingTemplate' | 'expectedArtifactTypes' | 'exportFailed' | 'exportTemplate'
  | 'exported' | 'fileReadError' | 'hideToolTips' | 'imagePreview' | 'import'
  | 'importFailed' | 'importSkipped' | 'importStrategy' | 'importSuccess' | 'importTemplate'
  | 'importing' | 'invalidFileType' | 'invalidTemplate' | 'key' | 'loadExpertsFailed'
  | 'loadingTools' | 'loginSuccess' | 'mediaFile' | 'mediaPreviewDesc' | 'mediaPreviewMode'
  | 'messagePreview' | 'minOneTask' | 'mode' | 'name' | 'noData'
  | 'noSystemPrompt' | 'noToolPoliciesFound' | 'or' | 'override' | 'overrideDescription'
  | 'pleaseSelectJsonFile' | 'sceneCodeGen' | 'sceneDeepResearch' | 'sceneQuickQA' | 'selectCategory'
  | 'sendCode' | 'showToolTips' | 'simpleChatMode' | 'simpleChatPreviewDesc' | 'skip'
  | 'skipDescription' | 'templateExists' | 'templateExported' | 'templateInfo' | 'templateKeyConflict'
  | 'templateValid' | 'thinkingAnalysis' | 'thinkingArtifact' | 'thinkingCoding' | 'thinkingCompleted'
  | 'thinkingDefault' | 'thinkingExecution' | 'thinkingInProgress' | 'thinkingMemory' | 'thinkingPlanning'
  | 'thinkingProcess' | 'thinkingReading' | 'thinkingSearch' | 'thinkingWriting' | 'toolTipsDescription'
  | 'toolUsageExample' | 'unknownError' | 'unnamedAgent' | 'verifyIdentity' | 'videoPreview'
  | 'webSearch' | 'welcomeBack'



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
