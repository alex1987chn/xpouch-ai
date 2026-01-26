// 用户设置数据结构
export interface UserSettings {
  username: string
  password: string
  avatar: string // Base64 编码的头像图片
}

import { logger } from '@/utils/logger'

const STORAGE_KEY = 'xpouch-user-settings'

// 默认用户设置
export const DEFAULT_USER_SETTINGS: UserSettings = {
  username: 'XPouch Hero',
  password: '',
  avatar: ''
}

// 从 localStorage 读取用户设置
export function loadUserSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    logger.error('Failed to load user settings:', error)
  }
  return { ...DEFAULT_USER_SETTINGS }
}

// 保存用户设置
export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    logger.error('Failed to save user settings:', error)
  }
}

// 将图片转换为 Base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = error => reject(error)
  })
}

// 获取头像显示内容（如果有自定义头像显示自定义头像，否则显示默认）
export function getAvatarDisplay(avatar: string, username: string): string {
  return avatar || username.substring(0, 2).toUpperCase()
}
