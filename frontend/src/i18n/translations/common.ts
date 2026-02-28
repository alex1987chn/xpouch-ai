import { TranslationKey } from '../index'

// 通用翻译 - 导航、按钮、通用操作等

export const zh: Record<string, string> = {
  // Navigation
  newChat: '新会话',
  draftSaved: '草稿已保存',
  draftRestored: '已恢复未发送的消息',
  history: '会话记录',
  knowledgeBase: '知识库',
  library: '资源工坊',
  workshop: '工坊',
  settings: '设置',
  home: '首页',
  recentChats: '最近会话',
  navDashboard: '首页',
  navExperts: '专家管理',
  memoryDump: '最近会话',
  noDataStream: '[无数据]',

  // Error
  error: '错误',
  operationFailed: '操作失败',

  // Common
  save: '保存',
  cancel: '取消',
  delete: '删除',
  edit: '编辑',
  confirmDelete: '确认',
  noHistory: '暂无历史记录',
  startChat: '开始一个新的聊天',
  totalHistory: '条历史记录',
  totalItems: '项内容',
  matchingHistory: '条匹配的历史记录',
  matchingItems: '项匹配的内容',
  searchHistory: '搜索历史记录...',
  noMatchingHistory: '未找到匹配的历史记录',
  tryOtherKeywords: '尝试其他关键词',

  // Create Agent
  create: '创建',
  agentName: '智能体名称',
  agentNamePlaceholder: '例如：编程助手',
  description: '描述',
  descriptionPlaceholder: '简要描述这个智能体的功能...',
  systemPrompt: '系统提示词',
  systemPromptPlaceholder: '你是一个专业的助手，擅长...',
  systemPromptHint: '定义智能体应该如何行为和响应',
  required: '必填',

  // User Menu
  currentPlan: '当前计划',
  logout: '退出登录',

  // Chat Actions
  copy: '复制',
  copied: '已复制',
  regenerate: '重新生成',
  resend: '重新发送',
  retry: '重试',
  preview: '预览',

  // Delete Dialog
  confirmDeleteTitle: '确认删除',
  confirmDeleteDescription: '此操作无法撤销，请确认是否继续？',
  deleting: '删除中...',

  // Common states
  success: '成功',
  loading: '加载中...',
}

export const en: Record<string, string> = {
  // Navigation
  newChat: 'New Chat',
  draftSaved: 'Draft saved',
  draftRestored: 'Restored unsent message',
  history: 'Conversations',
  knowledgeBase: 'Knowledge Base',
  library: 'Library',
  workshop: 'Workshop',
  settings: 'Settings',
  home: 'Home',
  recentChats: 'Recent Chats',
  navDashboard: 'Dashboard',
  navExperts: 'Experts',
  memoryDump: 'Recent Chats',
  noDataStream: '[NO DATA]',

  // Error
  error: 'Error',
  operationFailed: 'Operation failed',

  // Common
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  confirmDelete: 'Are you sure you want to delete this conversation?',
  noHistory: 'No conversation history',
  startChat: 'Start a new chat to see it here',
  totalHistory: 'history records',
  totalItems: 'total items',
  matchingHistory: 'matching history',
  matchingItems: 'matching items',
  searchHistory: 'Search history...',
  noMatchingHistory: 'No matching history found',
  tryOtherKeywords: 'Try other keywords',

  // Create Agent
  create: 'Create',
  agentName: 'Agent Name',
  agentNamePlaceholder: 'e.g., Coding Assistant',
  description: 'Description',
  descriptionPlaceholder: 'A brief description of what this agent does...',
  systemPrompt: 'System Prompt',
  systemPromptPlaceholder: 'You are a helpful assistant who specializes in...',
  systemPromptHint: 'Define how agent should behave and respond',
  required: 'Required',

  // User Menu
  currentPlan: 'Current Plan',
  logout: 'Logout',

  // Chat Actions
  copy: 'COPY',
  copied: 'COPIED',
  regenerate: 'Regenerate',
  resend: 'Resend',
  retry: 'RETRY',
  preview: 'Preview',

  // Delete Dialog
  confirmDeleteTitle: 'Confirm Delete',
  confirmDeleteDescription: 'This action cannot be undone. Are you sure you want to continue?',
  deleting: 'Deleting...',

  // Common states
  success: 'Success',
  loading: 'Loading...',
}

export const ja: Record<string, string> = {
  // Navigation
  newChat: '新しいチャット',
  draftSaved: '下書きを保存しました',
  draftRestored: '未送信のメッセージを復元しました',
  history: '会話記録',
  knowledgeBase: 'ナレッジベース',
  library: 'ライブラリ',
  workshop: 'ワークショップ',
  settings: '設定',
  home: 'ホーム',
  recentChats: '最近のチャット',
  navDashboard: 'ダッシュボード',
  navExperts: 'エキスパート管理',
  memoryDump: '最近のチャット',
  noDataStream: '[データなし]',

  // Error
  error: 'エラー',
  operationFailed: '操作に失敗しました',

  // Common
  save: '保存',
  cancel: 'キャンセル',
  delete: '削除',
  edit: '編集',
  confirmDelete: 'この会話を削除してもよろしいですか？',
  noHistory: '履歴なし',
  startChat: '新しいチャットを開始してここに表示します',
  totalHistory: '件の履歴',
  totalItems: '件のアイテム',
  matchingHistory: '件の一致する履歴',
  matchingItems: '件の一致するアイテム',
  searchHistory: '履歴を検索...',
  noMatchingHistory: '一致する履歴が見つかりません',
  tryOtherKeywords: '他のキーワードを試してください',

  // Create Agent
  create: '作成',
  agentName: 'エージェント名',
  agentNamePlaceholder: '例：プログラミングアシスタント',
  description: '説明',
  descriptionPlaceholder: 'このエージェントの機能の簡単な説明...',
  systemPrompt: 'システムプロンプト',
  systemPromptPlaceholder: 'あなたは専門的なアシスタントで、...',
  systemPromptHint: 'エージェントがどのように動作し、応答するかを定義',
  required: '必須',

  // User Menu
  currentPlan: '現在のプラン',
  logout: 'ログアウト',

  // Chat Actions
  copy: 'コピー',
  copied: 'コピー済み',
  regenerate: '再生成',
  resend: '再送信',
  retry: '再試行',
  preview: 'プレビュー',

  // Delete Dialog
  confirmDeleteTitle: '削除の確認',
  confirmDeleteDescription: 'この操作は取り消せません。続行しますか？',
  deleting: '削除中...',

  // Common states
  success: '成功',
  loading: '読み込み中...',
}
