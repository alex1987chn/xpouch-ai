// 通用翻译 - 导航、按钮、通用操作等

export const zh = {
  // Navigation
  newChat: '新会话',
  history: '会话记录',
  knowledgeBase: '知识库',
  library: '资源工坊',
  settings: '设置',
  navDashboard: '首页',
  navExperts: '专家管理',
  navConsole: '系统管理',
  systemStatusLockedDesc: '管理控制台仅对管理员开放，包含系统状态、专家与模型、工具治理等实例级管理功能',
  navStats: '运行统计',

  // Error
  error: '错误',

  // Common
  save: '保存',
  cancel: '取消',
  delete: '删除',
  edit: '编辑',
  confirmDelete: '确认',
  totalItems: '项内容',
  noMatchingHistory: '未找到匹配的历史记录',
  tryOtherKeywords: '尝试其他关键词',

  // Create Agent
  create: '创建',
  description: '描述',
  systemPrompt: '系统提示词',
  systemPromptPlaceholder: '你是一个专业的助手，擅长...',
  required: '必填',

  // User Menu
  currentPlan: '当前计划',
  logout: '退出登录',
  confirmLogoutTitle: '确认退出登录',
  download: '下载',
  copyFailed: '复制失败',
  confirmLogoutDesc: '退出后需要重新验证才能继续使用。',

  // Chat Actions
  copy: '复制',
  copied: '已复制',
  regenerate: '重新生成',
  retry: '重试',

  // Delete Dialog
  confirmDeleteTitle: '确认删除',
  confirmDeleteThread: '删除会话',
  deleteThreadWarning: '会话及其消息、运行记录将一并删除，此操作不可恢复。',
  sessionDeleted: '会话已删除',
  confirmDeleteDescription: '此操作无法撤销，请确认是否继续？',
  deleting: '删除中...',
  
  // Cancel Dialog

  // Common states
  success: '成功',
  failed: '失败',
  loading: '加载中...',
  serverErrorTitle: '服务端错误',
  serverErrorFallback: '请求处理失败，请重试',

  // StatsPage
  totalRuns: '总运行数',
  successRate: '成功率',
  hitlCount: '待审核',
  avgDuration: '平均耗时',
  trends: '趋势',
  days: '天',
  noRuns: '暂无运行记录',
  noRunsHint: '完成第一个任务后，这里会展示你的运行趋势和消耗',
  todayTokens: '今日 Token',
  quotaRemaining: '配额剩余',
  runList: '运行记录',
  prev: '上一页',
  next: '下一页',
  loadFailed: '加载失败',

  // 权限与通用提示
  permissionDenied: '权限不足',
  adminOnly: '该功能仅限管理员使用',
  welcomeBack: '欢迎回来',
  verifyIdentity: '验证身份',
  sendCode: '发送验证码',
  canceling: '取消中...',
  general: '综合',
  login: '登录',
  loginTabOtp: '验证码登录',
  passwordLoginTab: '密码登录',
  identifierLabel: '手机号 / 邮箱',
  identifierPlaceholder: '手机号或邮箱',
  passwordPlaceholder: '请输入密码',
  accountAndPasswordRequired: '请输入账号和密码',
  passwordLoginHint: '手机验证码注册的账号，可在设置中开启密码登录',
  passwordSetup: '密码设置',
  oldPasswordPlaceholder: '当前密码',
  newPasswordPlaceholder: '新密码（至少 8 位）',
  passwordMinLength: '密码至少 8 位',
  oldPasswordRequired: '请输入当前密码',
  passwordSaved: '密码已保存',
  newPasswordLabel: '新密码',
  forgotPasswordLink: '忘记密码？',
  resetPasswordTitle: '重置密码',
  resetPasswordAction: '重置密码',
  resetSendHint: '验证码将发送到该手机号，仅限已注册账号',
  passwordResetSuccess: '密码已重置，请使用新密码登录',
  backToLogin: '返回登录',
  passwordSaveAction: '设置密码',
  passwordSaving: '保存密码中...',
  accountSecurity: '账号与安全',
  accountSecurityDesc: '密码修改即时生效，用于手机验证码之外的密码登录',
  loginRequiredDesc: '登录后即可查看该页面内容',
  loginRequired: '请先登录',
  retryAction: '重试',
  menu: '菜单',
  image: '图片',
  attachment: '附件',
  artifactChartGenerating: '图表生成中...',
  artifactMermaidGenerating: '流程图生成中...',
  artifactDataError: '图表数据格式错误',
  artifactHtmlTruncated: 'HTML 生成不完整（输出可能被截断），预览可能为空白。可在代码视图中查看已生成部分，或重新生成。',
  videoLoading: '加载视频中...',
  videoLoadFailed: '视频加载失败',
  imageLoading: '加载图片中...',
  imageLoadFailed: '图片加载失败',
  mediaLinkInvalid: '无法识别有效的媒体链接',
  artifactSchemaHintPlaceholder: '产出物应包含：\n# 标题\n- 要点1\n- 要点2',
  phoneNumberPlaceholder: '11位手机号码',
  autoRegisterHint: '首次登录将自动注册账号',
  codePlaceholder: '6位验证码',
  codeSentTo: '验证码已发送至 {phone}',
  changePhone: '修改手机号',
  source: '源码',
  mediaFile: '媒体文件',
  resend: '重新发送',
  noData: '暂无数据',

  // 验证提示
  enterValidPhone: '请输入有效的手机号码',
  enterCode: '请输入验证码',
  uploadImageFile: '请上传图片文件',
  usernameRequired: '用户名不能为空',
  usernameMinLength: '用户名至少需要2个字符',
  usernameMaxLength: '用户名不能超过20个字符',
  imageSizeExceeded: '图片大小不能超过 2MB',
  imageProcessFailed: '图片处理失败，请重试',
  saveFailedLater: '保存失败，请稍后重试',

  // 语言选择

  // 默认助手

  // 登录后消息重发

  // 批量删除
  select: '选择',
}

export const en = {
  // Navigation
  newChat: 'New Chat',
  history: 'Conversations',
  knowledgeBase: 'Knowledge Base',
  library: 'Library',
  settings: 'Settings',
  navDashboard: 'Dashboard',
  navExperts: 'Experts',
  navConsole: 'System',
  systemStatusLockedDesc: 'The management console is admin-only: system status, experts & models, tool governance and other instance-level settings',
  navStats: 'Run Stats',

  // Error
  error: 'Error',

  // Common
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  confirmDelete: 'Are you sure you want to delete this conversation?',
  totalItems: 'total items',
  noMatchingHistory: 'No matching history found',
  tryOtherKeywords: 'Try other keywords',

  // Create Agent
  create: 'Create',
  description: 'Description',
  systemPrompt: 'System Prompt',
  systemPromptPlaceholder: 'You are a helpful assistant who specializes in...',
  required: 'Required',

  // User Menu
  currentPlan: 'Current Plan',
  logout: 'Logout',
  confirmLogoutTitle: 'Confirm logout',
  confirmLogoutDesc: 'You will need to sign in again to continue.',

  // Chat Actions
  copy: 'Copy',
  copied: 'Copied',
  regenerate: 'Regenerate',
  retry: 'Retry',

  // Delete Dialog
  confirmDeleteTitle: 'Confirm Delete',
  confirmDeleteThread: 'Delete conversation',
  deleteThreadWarning: 'Conversation, its messages and runs will be deleted. This cannot be undone.',
  sessionDeleted: 'Conversation deleted',
  download: 'Download',
  copyFailed: 'Copy failed',
  confirmDeleteDescription: 'This action cannot be undone. Are you sure you want to continue?',
  deleting: 'Deleting...',
  
  // Cancel Dialog

  // Common states
  success: 'Success',
  failed: 'Failed',
  loading: 'Loading...',
  serverErrorTitle: 'Server error',
  serverErrorFallback: 'Request failed, please try again',

  // StatsPage
  totalRuns: 'Total Runs',
  successRate: 'Success Rate',
  hitlCount: 'Awaiting review',
  avgDuration: 'Avg Duration',
  trends: 'Trends',
  days: 'days',
  noRuns: 'No runs yet',
  noRunsHint: 'Your run trends and usage appear here after your first task',
  todayTokens: 'Tokens Today',
  quotaRemaining: 'Quota left',
  runList: 'Run History',
  prev: 'Prev',
  next: 'Next',
  loadFailed: 'Load Failed',

  // 权限与通用提示
  permissionDenied: 'Permission Denied',
  adminOnly: 'This feature is for administrators only',
  welcomeBack: 'Welcome Back',
  verifyIdentity: 'Verify Identity',
  sendCode: 'Send Code',
  canceling: 'Canceling...',
  general: 'General',
  login: 'Login',
  loginTabOtp: 'SMS Code',
  passwordLoginTab: 'Password',
  identifierLabel: 'PHONE / EMAIL',
  identifierPlaceholder: 'Phone number or email',
  passwordPlaceholder: 'Enter your password',
  accountAndPasswordRequired: 'Account and password are required',
  passwordLoginHint: 'Accounts registered via SMS can enable password login in Settings',
  passwordSetup: 'Password',
  oldPasswordPlaceholder: 'Current password',
  newPasswordPlaceholder: 'New password (min 8 characters)',
  passwordMinLength: 'Password must be at least 8 characters',
  newPasswordLabel: 'New Password',
  forgotPasswordLink: 'Forgot password?',
  resetPasswordTitle: 'Reset Password',
  resetPasswordAction: 'Reset Password',
  resetSendHint: 'A code will be sent to this phone number (registered accounts only)',
  passwordResetSuccess: 'Password reset. Please sign in with your new password',
  backToLogin: 'Back to Login',
  passwordSaveAction: 'Set Password',
  passwordSaving: 'Saving password...',
  accountSecurity: 'Account & Security',
  accountSecurityDesc: 'Changes take effect immediately. Used for password login in addition to SMS code',
  loginRequiredDesc: 'Sign in to view this page',
  loginRequired: 'Please sign in first',
  retryAction: 'Retry',
  oldPasswordRequired: 'Enter your current password',
  passwordSaved: 'Password saved',
  menu: 'Menu',
  image: 'Image',
  attachment: 'Attachment',
  artifactChartGenerating: 'Generating chart...',
  artifactMermaidGenerating: 'Generating diagram...',
  artifactDataError: 'Invalid chart data format',
  artifactHtmlTruncated: 'HTML is incomplete (output may have been truncated); the preview may appear blank. Check the generated portion in code view or regenerate.',
  videoLoading: 'Loading video...',
  videoLoadFailed: 'Video failed to load',
  imageLoading: 'Loading image...',
  imageLoadFailed: 'Image failed to load',
  mediaLinkInvalid: 'Cannot recognize a valid media link',
  artifactSchemaHintPlaceholder: 'Artifact should contain:\n# Title\n- Point 1\n- Point 2',
  phoneNumberPlaceholder: '11-digit phone number',
  autoRegisterHint: 'First login automatically registers an account',
  codePlaceholder: '6-digit code',
  codeSentTo: 'Code sent to {phone}',
  changePhone: 'Change number',
  source: 'Source',
  mediaFile: 'Media File',
  resend: 'Resend',
  noData: 'No data',

  // 验证提示
  enterValidPhone: 'Please enter a valid phone number',
  enterCode: 'Please enter the verification code',
  uploadImageFile: 'Please upload an image file',
  usernameRequired: 'Username is required',
  usernameMinLength: 'Username must be at least 2 characters',
  usernameMaxLength: 'Username cannot exceed 20 characters',
  imageSizeExceeded: 'Image size cannot exceed 2MB',
  imageProcessFailed: 'Image processing failed, please try again',
  saveFailedLater: 'Save failed, please try again later',

  // 语言选择

  // Default Agent

  // Post-login message retry

  // Batch delete
  select: 'Select',
}

export const ja = {
  // Navigation
  newChat: '新しいチャット',
  history: '会話記録',
  knowledgeBase: 'ナレッジベース',
  library: 'ライブラリ',
  settings: '設定',
  navDashboard: 'ダッシュボード',
  navExperts: 'エキスパート管理',
  navConsole: 'システム管理',
  systemStatusLockedDesc: '管理コンソールは管理者専用です。システム状態、エキスパートとモデル、ツールガバナンスなどのインスタンス設定を含みます',
  navStats: '実行統計',

  // Error
  error: 'エラー',

  // Common
  save: '保存',
  cancel: 'キャンセル',
  delete: '削除',
  edit: '編集',
  confirmDelete: 'この会話を削除してもよろしいですか？',
  totalItems: '件のアイテム',
  noMatchingHistory: '一致する履歴が見つかりません',
  tryOtherKeywords: '他のキーワードを試してください',

  // Create Agent
  create: '作成',
  description: '説明',
  systemPrompt: 'システムプロンプト',
  systemPromptPlaceholder: 'あなたは専門的なアシスタントで、...',
  required: '必須',

  // User Menu
  currentPlan: '現在のプラン',
  logout: 'ログアウト',
  confirmLogoutTitle: 'ログアウトの確認',
  confirmLogoutDesc: '続行するには再度サインインが必要です。',

  // Chat Actions
  copy: 'コピー',
  copied: 'コピー済み',
  regenerate: '再生成',
  retry: '再試行',

  // Delete Dialog
  confirmDeleteTitle: '削除の確認',
  confirmDeleteThread: '会話を削除',
  deleteThreadWarning: '会話とメッセージ・実行履歴はすべて削除されます。元に戻せません。',
  sessionDeleted: '会話を削除しました',
  download: 'ダウンロード',
  copyFailed: 'コピーに失敗しました',
  confirmDeleteDescription: 'この操作は取り消せません。続行しますか？',
  deleting: '削除中...',
  
  // Cancel Dialog

  // Common states
  success: '成功',
  failed: '失敗',
  loading: '読み込み中...',
  serverErrorTitle: 'サーバーエラー',
  serverErrorFallback: 'リクエストが失敗しました。もう一度お試しください',

  // StatsPage
  totalRuns: '総実行数',
  successRate: '成功率',
  hitlCount: '承認待ち',
  avgDuration: '平均所要時間',
  trends: '傾向',
  days: '日',
  noRuns: '実行記録なし',
  noRunsHint: '最初のタスク完了後、ここに実行トレンドと消費量が表示されます',
  todayTokens: '今日のトークン',
  quotaRemaining: '残り枠',
  runList: '実行履歴',
  prev: '前へ',
  next: '次へ',
  loadFailed: '読み込み失敗',

  // 权限与通用提示
  permissionDenied: '権限がありません',
  adminOnly: 'この機能は管理者のみ使用可能です',
  welcomeBack: 'おかえりなさい',
  verifyIdentity: '身分を証明',
  sendCode: '認証コードを送信',
  canceling: 'キャンセル中...',
  general: '一般',
  login: 'ログイン',
  loginTabOtp: 'SMS認証',
  passwordLoginTab: 'パスワード',
  identifierLabel: '電話 / メール',
  identifierPlaceholder: '電話番号またはメールアドレス',
  passwordPlaceholder: 'パスワードを入力',
  accountAndPasswordRequired: 'アカウントとパスワードを入力してください',
  passwordLoginHint: 'SMSで登録したアカウントは、設定でパスワードログインを有効化できます',
  passwordSetup: 'パスワード設定',
  oldPasswordPlaceholder: '現在のパスワード',
  newPasswordPlaceholder: '新しいパスワード（8文字以上）',
  passwordMinLength: 'パスワードは8文字以上必要です',
  newPasswordLabel: '新しいパスワード',
  forgotPasswordLink: 'パスワードをお忘れですか？',
  resetPasswordTitle: 'パスワードリセット',
  resetPasswordAction: 'パスワードをリセット',
  resetSendHint: '確認コードをこの電話番号に送信します（登録済みアカウントのみ）',
  passwordResetSuccess: 'パスワードをリセットしました。新しいパスワードでログインしてください',
  backToLogin: 'ログインに戻る',
  passwordSaveAction: 'パスワードを設定',
  passwordSaving: '保存中...',
  accountSecurity: 'アカウントとセキュリティ',
  accountSecurityDesc: '変更は即時反映されます。SMS認証に加えてパスワードログインに使用します',
  loginRequiredDesc: 'ログインするとこのページの内容を表示できます',
  loginRequired: '先にログインしてください',
  retryAction: '再試行',
  oldPasswordRequired: '現在のパスワードを入力してください',
  passwordSaved: 'パスワードを保存しました',
  menu: 'メニュー',
  image: '画像',
  attachment: '添付ファイル',
  artifactChartGenerating: 'チャート生成中...',
  artifactMermaidGenerating: 'ダイアグラム生成中...',
  artifactDataError: 'チャートデータの形式が正しくありません',
  artifactHtmlTruncated: 'HTML が不完全です（出力が途切れた可能性があります）。プレビューが空白になる場合があります。コードビューで生成済み部分を確認するか、再生成してください。',
  videoLoading: '動画を読み込み中...',
  videoLoadFailed: '動画の読み込みに失敗しました',
  imageLoading: '画像を読み込み中...',
  imageLoadFailed: '画像の読み込みに失敗しました',
  mediaLinkInvalid: '有効なメディアリンクを認識できません',
  artifactSchemaHintPlaceholder: '成果物に含める内容：\n# タイトル\n- ポイント1\n- ポイント2',
  phoneNumberPlaceholder: '11桁の電話番号',
  autoRegisterHint: '初回ログインで自動的にアカウント登録されます',
  codePlaceholder: '6桁の認証コード',
  codeSentTo: '認証コードを送信しました {phone}',
  changePhone: '電話番号を変更',
  source: 'ソース',
  mediaFile: 'メディアファイル',
  resend: '再送信',
  noData: 'データがありません',

  // 验证提示
  enterValidPhone: '有効な電話番号を入力してください',
  enterCode: '認証コードを入力してください',
  uploadImageFile: '画像ファイルをアップロードしてください',
  usernameRequired: 'ユーザー名は必須です',
  usernameMinLength: 'ユーザー名は2文字以上である必要があります',
  usernameMaxLength: 'ユーザー名は20文字を超えることはできません',
  imageSizeExceeded: '画像サイズは2MBを超えることはできません',
  imageProcessFailed: '画像の処理に失敗しました。もう一度お試しください',
  saveFailedLater: '保存に失敗しました。後でもう一度お試しください',

  // 语言选择

  // デフォルトアシスタント

  // ログイン後のメッセージ再送信

  // 一括削除
  select: '選択',
}
