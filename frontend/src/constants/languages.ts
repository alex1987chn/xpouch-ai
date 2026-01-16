import { Language } from '@/i18n'

export interface LanguageOption {
  code: Language
  name: string
  nativeName: string
}

export const languages: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: '中文', nativeName: '简体中文' },
  { code: 'ja', name: '日本語', nativeName: '日本語' }
]
