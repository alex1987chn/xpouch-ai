// 设置相关翻译 - 系统设置、个人设置等

export const zh: Record<string, string> = {
  // Settings
  theme: '主题',
  language: '语言',
  systemSettings: '系统设置',
  userSettings: '个人设置',
  personalSettings: '个人设置',
  modelConfig: '模型配置',

  // Personal Settings Dialog
  avatarSetup: '头像设置',
  uploadAvatar: '上传头像',
  removeAvatar: '移除',
  avatarHint: '支持 JPG、PNG 格式，最大 2MB',
  username: '用户名',
  usernamePlaceholder: '请输入用户名',
  usernameHint: '2-20 个字符',
  userConfig: '用户配置',
  savingUserSettings: '保存中...',

  // Settings Dialog (System Config)
  systemConfig: '系统配置',
  defaultModel: '默认模型',
  apiKeyConfig: 'API Key 配置',
  apiKeyConfigTitle: 'API Key 配置说明',
  apiKeyConfigDesc: '所有 API Key 均通过服务端环境变量配置，以确保安全性。',
  apiKeyConfigHint: '请在服务器上配置 .env 文件中的 DEEPSEEK_API_KEY、OPENAI_API_KEY、ANTHROPIC_API_KEY、GOOGLE_API_KEY',
  agentPrompts: '智能体 Prompt 配置',
  customized: '已自定义',
  defaultPrompt: '默认',

  // Model Config Dialog (Simple 模式偏好)
  simpleMode: 'Simple 模式（直接对话）',
  followSystemDefault: '跟随系统默认',
  thinkingMode: '思考模式',
  thinkingAuto: '跟随默认',
  thinkingOn: '开启',
  thinkingOff: '关闭',
  thinkingUnsupported: '当前模型不支持思考模式开关',
  thinkingCostHint: '开启思考模式可提升复杂问题的回答质量，但响应更慢、token 消耗更高',
  complexMode: 'Complex 模式（多专家任务）',
  complexModeDesc: '复杂模式使用的模型（规划与各专家）由管理员在「专家管理」中配置。',
  modelsLoading: '正在加载模型列表...',
  modelsLoadFailed: '模型列表加载失败，请稍后重试',
}

export const en: Record<string, string> = {
  // Settings
  theme: 'Theme',
  language: 'Language',
  systemSettings: 'System Settings',
  userSettings: 'User Settings',
  personalSettings: 'User Settings',
  modelConfig: 'Model Config',

  // Personal Settings Dialog
  avatarSetup: 'AVATAR SETUP',
  uploadAvatar: 'Upload Avatar',
  removeAvatar: 'Remove',
  avatarHint: 'Supports JPG, PNG format, max 2MB',
  username: 'Username',
  usernamePlaceholder: 'Enter username',
  usernameHint: '2-20 characters',
  userConfig: 'USER CONFIG',
  savingUserSettings: 'Saving...',

  // Settings Dialog (System Config)
  systemConfig: 'SYSTEM CONFIG',
  defaultModel: 'DEFAULT MODEL',
  apiKeyConfig: 'API Key Config',
  apiKeyConfigTitle: 'API Key Configuration',
  apiKeyConfigDesc: 'All API Keys are configured via server environment variables for security.',
  apiKeyConfigHint: 'Please configure DEEPSEEK_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY in the .env file on the server',
  agentPrompts: 'AGENT PROMPTS',
  customized: 'Customized',
  defaultPrompt: 'Default',

  // Model Config Dialog (Simple mode preferences)
  simpleMode: 'SIMPLE MODE (DIRECT CHAT)',
  followSystemDefault: 'Follow System Default',
  thinkingMode: 'Thinking Mode',
  thinkingAuto: 'Default',
  thinkingOn: 'On',
  thinkingOff: 'Off',
  thinkingUnsupported: 'This model does not support the thinking toggle',
  thinkingCostHint: 'Enabling thinking improves quality on complex questions, but is slower and costs more tokens',
  complexMode: 'COMPLEX MODE (MULTI-EXPERT TASKS)',
  complexModeDesc: 'Models used in complex mode (planner and experts) are configured by the administrator in Expert Management.',
  modelsLoading: 'Loading model list...',
  modelsLoadFailed: 'Failed to load model list, please retry later',
}

export const ja: Record<string, string> = {
  // Settings
  theme: 'テーマ',
  language: '言語',
  systemSettings: 'システム設定',
  userSettings: '個人設定',
  personalSettings: '個人設定',
  modelConfig: 'モデル設定',

  // Personal Settings Dialog
  avatarSetup: 'アバター設定',
  uploadAvatar: 'アバターをアップロード',
  removeAvatar: '削除',
  avatarHint: 'JPG、PNG形式をサポート、最大2MB',
  username: 'ユーザー名',
  usernamePlaceholder: 'ユーザー名を入力',
  usernameHint: '2-20文字',
  userConfig: 'ユーザー設定',
  savingUserSettings: '保存中...',

  // Settings Dialog (System Config)
  systemConfig: 'システム設定',
  defaultModel: 'デフォルトモデル',
  apiKeyConfig: 'API Key 設定',
  apiKeyConfigTitle: 'API Key 設定説明',
  apiKeyConfigDesc: 'すべてのAPI Keyはセキュリティのためサーバー環境変数で設定されます。',
  apiKeyConfigHint: 'サーバーの.envファイルでDEEPSEEK_API_KEY、OPENAI_API_KEY、ANTHROPIC_API_KEY、GOOGLE_API_KEYを設定してください',
  agentPrompts: 'エージェントプロンプト',
  customized: 'カスタマイズ済み',
  defaultPrompt: 'デフォルト',

  // Model Config Dialog (Simple モード設定)
  simpleMode: 'Simpleモード（直接会話）',
  followSystemDefault: 'システム既定に従う',
  thinkingMode: '思考モード',
  thinkingAuto: '既定',
  thinkingOn: 'オン',
  thinkingOff: 'オフ',
  thinkingUnsupported: 'このモデルは思考モード切替に非対応です',
  thinkingCostHint: '思考モードを有効にすると複雑な質問の品質が向上しますが、応答が遅くトークン消費も増えます',
  complexMode: 'Complexモード（マルチエキスパート）',
  complexModeDesc: 'Complexモードで使用するモデル（プランナーとエキスパート）は管理者が「エキスパート管理」で設定します。',
  modelsLoading: 'モデルリストを読み込み中...',
  modelsLoadFailed: 'モデルリストの取得に失敗しました。後でもう一度お試しください',
}
