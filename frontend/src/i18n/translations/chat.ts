import { TranslationKey } from '../index'

// 聊天页翻译 - 对话、输入、专家状态等

export const zh: Record<string, string> = {
  // Chat
  startConversation: '开始对话',
  initConversation: '开始新对话',
  analyzingRequestStream: '正在分析请求流...',

  // Chat messages
  detectingComplexTask: '检测到复杂任务，正在拆解...',
  complexTaskCompleted: '✅ 复杂任务执行完成，请查看右侧的专家状态栏和 artifact 区域获取详细结果。',
  taskPlan: '📋 任务计划：',

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
  inputPlaceholder: '// 准备装载...',
  execute: '执行',
  processing: '处理中',

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

  // Orchestrator Panel
  overview: '概览',
  ganttViewTitle: '任务概览',
  noArtifactsTitle: '暂无交付物',
  noArtifactsDesc: '等待专家生成交付物。任务进行时，交付物将显示在这里。',
  exitFullscreen: '退出全屏',
  openFullscreen: '全屏打开',
  loadingModule: '加载模块中...',

  // Expert Modal
  taskLogTitle: '任务日志',
  outputConsole: '输出控制台',
  noOutputAvailable: '暂无输出',

  // Artifact Area
  noArtifacts: '暂无交付物',
  clickExpertToView: '点击专家状态栏中的专家查看交付物',
  closePreview: '关闭预览模式',

  // Preview Button
  preview: '预览',

  // Thinking Process
  thinking: '思考过程',
  thinkingProcess: '思考过程',
  thinkingSteps: '执行步骤',
  showThinking: '显示思考',
  hideThinking: '隐藏思考',
  thinkingCompleted: '思考完成',
  thinkingInProgress: '思考中',

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
  designUIDesc: '基于 Figma 设计稿实现 React 组件',

  // Thinking Steps
  thinkingSearch: '搜索',
  thinkingReading: '深度阅读',
  thinkingAnalysis: '分析思考',
  thinkingCoding: '代码生成',
  thinkingPlanning: '任务规划',
  thinkingWriting: '写作生成',
  thinkingArtifact: '生成产物',
  thinkingMemory: '记忆检索',
  thinkingExecution: '任务执行',
  thinkingDefault: '思考',

  // 预览相关
  videoPreview: '视频预览',
  imagePreview: '图片预览',
  codePreview: '代码预览',
  messagePreview: '消息预览',
  mediaPreviewMode: '媒体预览模式',
  simpleChatMode: '简单对话模式',
  mediaPreviewDesc: '媒体内容预览',
  simpleChatPreviewDesc: '简单对话预览',

  // 其他提示
  minOneTask: '至少需要保留一个任务',
  deleteTask: '删除任务',

  // Polling (轮询恢复)
  pollingRestoring: '正在恢复任务连接...',
  pollingHitlPaused: '等待审批中...',
  pollingRefresh: '刷新',
  pollingError: '连接失败，请刷新重试',
}

export const en: Record<string, string> = {
  // Chat
  startConversation: 'Start Conversation',
  initConversation: 'Initialize conversation',
  analyzingRequestStream: 'Analyzing request stream...',

  // Chat messages
  detectingComplexTask: 'Detecting complex task, breaking it down...',
  complexTaskCompleted: '✅ Complex task execution completed. Check the expert status bar and artifact area on the right for detailed results.',
  taskPlan: '📋 Task Plan:',

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
  inputPlaceholder: '// AWAITING PAYLOAD...',
  execute: 'EXECUTE',
  processing: 'PROCESSING',

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

  // Orchestrator Panel
  overview: 'Overview',
  ganttViewTitle: 'Task Overview',
  noArtifactsTitle: 'No Artifacts Yet',
  noArtifactsDesc: 'Waiting for experts to generate deliverables. Artifacts will appear here once the task is in progress.',
  exitFullscreen: 'Exit Fullscreen',
  openFullscreen: 'Open in Fullscreen',
  loadingModule: 'LOADING_MODULE...',

  // Expert Modal
  taskLogTitle: 'TASK_LOG',
  outputConsole: 'OUTPUT_CONSOLE',
  noOutputAvailable: 'No output available',

  // Artifact Area
  noArtifacts: 'No Artifacts',
  clickExpertToView: 'Click on expert in status bar to view artifacts',
  closePreview: 'Close Preview Mode',

  // Preview Button
  preview: 'Preview',

  // Thinking Process
  thinking: 'Thinking',
  thinkingProcess: 'Thinking Process',
  thinkingSteps: 'Execution Steps',
  showThinking: 'Show Thinking',
  hideThinking: 'Hide Thinking',
  thinkingCompleted: 'Thinking Completed',
  thinkingInProgress: 'Thinking in Progress',

  // Workflow Steps (Expert Drawer)
  receiveTask: 'Receive Task',
  receiveTaskDesc: 'Parse task description from user input',
  buildQuery: 'Build Query',
  buildQueryDesc: 'Build search query based on keywords',
  executeSearch: 'Execute Search',
  executeSearchDesc: 'Call search API to execute query',
  analyzeData: 'Analyze Data',
  analyzeDataDesc: 'Process search results and extract key information',
  generateReport: 'Generate Report',
  generateReportDesc: 'Summarize analysis results and output structured data',
  designUI: 'Design UI Components',
  designUIDesc: 'Implement React components based on Figma designs',

  // Thinking Steps
  thinkingSearch: 'Search',
  thinkingReading: 'Deep Reading',
  thinkingAnalysis: 'Analysis',
  thinkingCoding: 'Code Generation',
  thinkingPlanning: 'Task Planning',
  thinkingWriting: 'Writing',
  thinkingArtifact: 'Artifact Generation',
  thinkingMemory: 'Memory Retrieval',
  thinkingExecution: 'Task Execution',
  thinkingDefault: 'Thinking',

  // Preview Related
  videoPreview: 'Video Preview',
  imagePreview: 'Image Preview',
  codePreview: 'Code Preview',
  messagePreview: 'Message Preview',
  mediaPreviewMode: 'Media Preview Mode',
  simpleChatMode: 'Simple Chat Mode',
  mediaPreviewDesc: 'Media content preview',
  simpleChatPreviewDesc: 'Simple conversation preview',

  // Other Messages
  minOneTask: 'At least one task must be kept',
  deleteTask: 'Delete Task',

  // Polling (Polling Recovery)
  pollingRestoring: 'Restoring task connection...',
  pollingHitlPaused: 'Waiting for approval...',
  pollingRefresh: 'Refresh',
  pollingError: 'Connection failed, please refresh',
}

export const ja: Record<string, string> = {
  // Chat
  startConversation: '会話を開始',
  initConversation: '会話を開始',
  analyzingRequestStream: 'リクエストストリームを分析中...',

  // Chat messages
  detectingComplexTask: '複雑なタスクを検出、分解中...',
  complexTaskCompleted: '✅ 複雑なタスクの実行が完了しました。詳細な結果については、右側のエキスパートステータスバーとアーティファクトエリアを確認してください。',
  taskPlan: '📋 タスク計画：',

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
  inputPlaceholder: '// 装填準備...',
  execute: '実行',
  processing: '処理中',

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

  // Orchestrator Panel
  overview: '概要',
  ganttViewTitle: 'タスク概要',
  noArtifactsTitle: 'まだ成果物がありません',
  noArtifactsDesc: 'エキスパートによる成果物の生成を待っています。タスクが進行すると、ここに成果物が表示されます。',
  exitFullscreen: '全画面終了',
  openFullscreen: '全画面で開く',
  loadingModule: 'モジュール読み込み中...',

  // Expert Modal
  taskLogTitle: 'タスクログ',
  outputConsole: '出力コンソール',
  noOutputAvailable: '出力がありません',

  // Artifact Area
  noArtifacts: 'アーティファクトなし',
  clickExpertToView: 'ステータスバーのエキスパートをクリックしてアーティファクトを表示',
  closePreview: 'プレビューモードを閉じる',

  // Preview Button
  preview: 'プレビュー',

  // Thinking Process
  thinking: '思考プロセス',
  thinkingProcess: '思考プロセス',
  thinkingSteps: '実行ステップ',
  showThinking: '思考を表示',
  hideThinking: '思考を隠す',
  thinkingCompleted: '思考完了',
  thinkingInProgress: '思考中',

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
  designUIDesc: 'Figmaデザインに基づいてReactコンポーネントを実装',

  // Thinking Steps
  thinkingSearch: '検索',
  thinkingReading: '深度読解',
  thinkingAnalysis: '分析思考',
  thinkingCoding: 'コード生成',
  thinkingPlanning: 'タスク計画',
  thinkingWriting: 'ライティング',
  thinkingArtifact: '成果物生成',
  thinkingMemory: '記憶検索',
  thinkingExecution: 'タスク実行',
  thinkingDefault: '思考',

  // プレビュー関連
  videoPreview: '動画プレビュー',
  imagePreview: '画像プレビュー',
  codePreview: 'コードプレビュー',
  messagePreview: 'メッセージプレビュー',
  mediaPreviewMode: 'メディアプレビューモード',
  simpleChatMode: 'シンプルチャットモード',
  mediaPreviewDesc: 'メディア内容のプレビュー',
  simpleChatPreviewDesc: '簡単な会話のプレビュー',

  // その他メッセージ
  minOneTask: '最低1つのタスクを保持する必要があります',
  deleteTask: 'タスクを削除',

  // Polling (ポーリング復旧)
  pollingRestoring: 'タスク接続を復元中...',
  pollingHitlPaused: '承認待ち...',
  pollingRefresh: '更新',
  pollingError: '接続失敗、更新してください',
}
