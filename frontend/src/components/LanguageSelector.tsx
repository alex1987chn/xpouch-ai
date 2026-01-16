import { useTranslation, type Language } from '@/i18n'
import { languages } from '@/constants/languages'

export function LanguageSelector() {
  const { language, setLanguage } = useTranslation()

  const getShortName = (code: string) => {
    switch (code) {
      case 'en': return 'En'
      case 'zh': return '中'
      case 'ja': return 'Ja'
      default: return code
    }
  }

  return (
    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code as Language)}
          className={`px-3 py-1 text-[10px] font-medium rounded-md transition-all duration-200 ${
            language === lang.code
              ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {getShortName(lang.code)}
        </button>
      ))}
    </div>
  )
}
