import { TranslationKey } from '../index'

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
}
