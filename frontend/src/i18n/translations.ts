import { TranslationKey } from './index'

export const zh: Record<TranslationKey, string> = {
  // Navigation
  newChat: '新会话',
  history: '历史记录',
  knowledgeBase: '知识库',
  settings: '设置',
  home: '首页',
  
  // Home
  greeting: '你好！我是 XPouch AI 助手',
  slogan: 'All Agents, One Pouch',
  placeholder: '进入多元宇宙...',
  featuredAgents: '精选智能体',
  myAgents: '我的智能体',
  createAgent: '创造您的专属智能体',
  backToChat: '会话',
  addCustomAgent: '添加自定义智能体',
  createYourFirstAgent: '创建第一个智能体',
  
  // Settings
  theme: '主题',
  language: '语言',
  systemSettings: '系统设置',
  userSettings: '个人设置',
  personalSettings: '个人设置',
  modelConfig: '模型配置',
  
  // Common
  save: '保存',
  cancel: '取消',
  delete: '删除',
  edit: '编辑',
  confirmDelete: '确认',
  noHistory: '暂无历史记录',
  startChat: '开始一个新的聊天',
  
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
  
  // Chat
  startConversation: '开始对话',

  // Knowledge Base
  newKnowledgeBase: '新建知识库',
  searchKnowledge: '搜索知识库...',
  documents: '文档',
  uploadDocument: '上传文档',
  noKnowledgeFound: '未找到知识库',
  noKnowledgeContent: '还没有创建任何知识库内容',
  createFirstKnowledge: '创建第一个知识库',
  
  // User Menu
  currentPlan: '当前计划',

  // Input & Chat
  uploadImage: '上传图片',
  uploadAttachment: '上传附件',
  simpleMode: '简单对话模式',
  complexMode: '复杂任务模式',
  simple: '简单',
  complex: '复杂',
  stop: '停止',
  send: '发送',
  enterToSend: '按 Enter 发送，Shift + Enter 换行',
  describeTask: '描述你的任务，AI 会帮你拆解...',

  // Chat Actions
  copy: '复制',
  regenerate: '重新生成',
  resend: '重新发送',

  // Expert Status
  taskDescription: '任务描述',
  clear: '清除',
  expertWorkflowDetails: '专家工作流详情',
  searchExpert: '搜索专家',
  analyzerExpert: '分析专家',
  frontendExpert: '前端专家',
  pending: '等待',
  running: '进行中',
  completed: '完成',

  // Delete Dialog
  confirmDeleteTitle: '确认删除',
  confirmDeleteDescription: '此操作无法撤销，请确认是否继续？',
  deleting: '删除中...',

  // Create Agent Page
  simpleDescription: '简单描述你的智能体...',
  defineBehavior: '定义智能体的行为、性格和能力',
  writingAssistantPlaceholder: '你是一个专业的写作助手...',
  tip: '提示',
  tipDescription: '填写名称和系统提示词后即可创建智能体。详细的提示词能让智能体更好地理解你的需求。',
  realtimePreview: '实时预览',
  previewDescription: '这是你的智能体在首页展示的效果',
  submitTaskPlaceholder: '描述你的任务，AI 会帮你拆解...',

  // Workflow Steps (Expert Drawer)
  receiveTask: '接收任务',
  receiveTaskDesc: '解析用户输入的任务描述',
  buildQuery: '构建查询',
  buildQueryDesc: '根据关键词构建搜索查询',
  executeSearch: '执行搜索',
  executeSearchDesc: '调用搜索 API 执行查询',
  analyzeData: '分析数据',
  analyzeDataDesc: '处理搜索结果，提取关键信息',
  generateReport: '生成报告',
  generateReportDesc: '汇总分析结果，输出结构化数据',
  designUI: '设计 UI 组件',
  designUIDesc: '基于 Figma 设计稿实现 React 组件'
}

export const en: Record<TranslationKey, string> = {
  // Navigation
  newChat: 'New Chat',
  history: 'History',
  knowledgeBase: 'Knowledge Base',
  settings: 'Settings',
  home: 'Home',
  
  // Home
  greeting: 'Hello! I am XPouch AI Assistant',
  slogan: 'All Agents, One Pouch',
  placeholder: 'Enter Multiverse...',
  featuredAgents: 'Featured Agents',
  myAgents: 'My Agents',
  createAgent: 'Create Your Exclusive Agent',
  backToChat: 'Back to Chat',
  addCustomAgent: 'Add Custom Agent',
  createYourFirstAgent: 'Create your first agent',
  
  // Settings
  theme: 'Theme',
  language: 'Language',
  systemSettings: 'System Settings',
  userSettings: 'User Settings',
  personalSettings: 'User Settings',
  modelConfig: 'Model Config',
  
  // Common
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  confirmDelete: 'Are you sure you want to delete this conversation?',
  noHistory: 'No conversation history',
  startChat: 'Start a new chat to see it here',
  
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
  
  // Chat
  startConversation: 'Start Conversation',

  // Knowledge Base
  newKnowledgeBase: 'New Knowledge Base',
  searchKnowledge: 'Search knowledge base...',
  documents: 'Documents',
  uploadDocument: 'Upload Document',
  noKnowledgeFound: 'No knowledge base found',
  noKnowledgeContent: 'No knowledge base content yet',
  createFirstKnowledge: 'Create first knowledge base',
  
  // User Menu
  currentPlan: 'Current Plan',

  // Input & Chat
  uploadImage: 'Upload Image',
  uploadAttachment: 'Upload Attachment',
  simpleMode: 'Simple Chat Mode',
  complexMode: 'Complex Task Mode',
  simple: 'Simple',
  complex: 'Complex',
  stop: 'Stop',
  send: 'Send',
  enterToSend: 'Press Enter to send, Shift + Enter for new line',
  describeTask: 'Describe your task, AI will help break it down...',

  // Chat Actions
  copy: 'Copy',
  regenerate: 'Regenerate',
  resend: 'Resend',

  // Expert Status
  taskDescription: 'Task Description',
  clear: 'Clear',
  expertWorkflowDetails: 'Expert Workflow Details',
  searchExpert: 'Search Expert',
  analyzerExpert: 'Analyzer Expert',
  frontendExpert: 'Frontend Expert',
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',

  // Delete Dialog
  confirmDeleteTitle: 'Confirm Delete',
  confirmDeleteDescription: 'This action cannot be undone. Are you sure you want to continue?',
  deleting: 'Deleting...',

  // Create Agent Page
  simpleDescription: 'Briefly describe your agent...',
  defineBehavior: 'Define the behavior, personality, and capabilities of the agent',
  writingAssistantPlaceholder: 'You are a professional writing assistant...',
  tip: 'Tip',
  tipDescription: 'Fill in the name and system prompt to create an agent. Detailed prompts help the agent better understand your needs.',
  realtimePreview: 'Real-time Preview',
  previewDescription: 'This is how your agent will appear on the home page',
  submitTaskPlaceholder: 'Describe your task, AI will help break it down...',

  // Workflow Steps (Expert Drawer)
  receiveTask: 'Receive Task',
  receiveTaskDesc: 'Parse the task description from user input',
  buildQuery: 'Build Query',
  buildQueryDesc: 'Build search query based on keywords',
  executeSearch: 'Execute Search',
  executeSearchDesc: 'Call search API to execute query',
  analyzeData: 'Analyze Data',
  analyzeDataDesc: 'Process search results and extract key information',
  generateReport: 'Generate Report',
  generateReportDesc: 'Summarize analysis results and output structured data',
  designUI: 'Design UI Components',
  designUIDesc: 'Implement React components based on Figma designs'
}

export const ja: Record<TranslationKey, string> = {
  // Navigation
  newChat: '新しいチャット',
  history: '履歴',
  knowledgeBase: 'ナレッジベース',
  settings: '設定',
  home: 'ホーム',
  
  // Home
  greeting: 'こんにちは！XPouch AI アシスタントです',
  slogan: 'All Agents, One Pouch',
  placeholder: 'マルチバースに入る...',
  featuredAgents: 'おすすめエージェント',
  myAgents: 'マイエージェント',
  createAgent: 'あなただけのエージェントを作成',
  backToChat: 'チャットに戻る',
  addCustomAgent: 'カスタムエージェントを追加',
  createYourFirstAgent: '最初のエージェントを作成',
  
  // Settings
  theme: 'テーマ',
  language: '言語',
  systemSettings: 'システム設定',
  userSettings: '個人設定',
  personalSettings: '個人設定',
  modelConfig: 'モデル設定',
  
  // Common
  save: '保存',
  cancel: 'キャンセル',
  delete: '削除',
  edit: '編集',
  confirmDelete: 'この会話を削除してもよろしいですか？',
  noHistory: '履歴なし',
  startChat: '新しいチャットを開始してここに表示します',
  
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
  
  // Chat
  startConversation: '会話を開始',

  // Knowledge Base
  newKnowledgeBase: '新規ナレッジベース',
  searchKnowledge: 'ナレッジベースを検索...',
  documents: 'ドキュメント',
  uploadDocument: 'ドキュメントをアップロード',
  noKnowledgeFound: 'ナレッジベースが見つかりません',
  noKnowledgeContent: 'ナレッジベースの内容がまだありません',
  createFirstKnowledge: '最初のナレッジベースを作成',
  
  // User Menu
  currentPlan: '現在のプラン',

  // Input & Chat
  uploadImage: '画像をアップロード',
  uploadAttachment: 'ファイルをアップロード',
  simpleMode: 'シンプルチャットモード',
  complexMode: '複雑なタスクモード',
  simple: 'シンプル',
  complex: '複雑',
  stop: '停止',
  send: '送信',
  enterToSend: 'Enterで送信、Shift + Enterで改行',
  describeTask: 'タスクを説明すると、AIが分解してくれます...',

  // Chat Actions
  copy: 'コピー',
  regenerate: '再生成',
  resend: '再送信',

  // Expert Status
  taskDescription: 'タスク説明',
  clear: 'クリア',
  expertWorkflowDetails: 'エキスパートワークフロー詳細',
  searchExpert: '検索エキスパート',
  analyzerExpert: '分析エキスパート',
  frontendExpert: 'フロントエンドエキスパート',
  pending: '待機中',
  running: '実行中',
  completed: '完了',

  // Delete Dialog
  confirmDeleteTitle: '削除の確認',
  confirmDeleteDescription: 'この操作は取り消せません。続行しますか？',
  deleting: '削除中...',

  // Create Agent Page
  simpleDescription: 'エージェントを簡単に説明...',
  defineBehavior: 'エージェントの行動、性格、能力を定義',
  writingAssistantPlaceholder: 'あなたは専門的なライティングアシスタント...',
  tip: 'ヒント',
  tipDescription: '名前とシステムプロンプトを入力してエージェントを作成します。詳細なプロンプトはエージェントがあなたのニーズをよりよく理解するのに役立ちます。',
  realtimePreview: 'リアルタイムプレビュー',
  previewDescription: 'これはエージェントがホームページに表示される方法です',
  submitTaskPlaceholder: 'タスクを説明すると、AIが分解してくれます...',

  // Workflow Steps (Expert Drawer)
  receiveTask: 'タスクを受信',
  receiveTaskDesc: 'ユーザー入力からタスク説明を解析',
  buildQuery: 'クエリを構築',
  buildQueryDesc: 'キーワードに基づいて検索クエリを構築',
  executeSearch: '検索を実行',
  executeSearchDesc: '検索APIを呼び出してクエリを実行',
  analyzeData: 'データを分析',
  analyzeDataDesc: '検索結果を処理して主要な情報を抽出',
  generateReport: 'レポートを生成',
  generateReportDesc: '分析結果を要約して構造化データを出力',
  designUI: 'UIコンポーネントを設計',
  designUIDesc: 'Figmaデザインに基づいてReactコンポーネントを実装'
}
