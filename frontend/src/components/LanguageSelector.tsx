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
    <div className="flex bg-slate-200 dark:bg-slate-700 rounded-full p-1 w-fit">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code as Language)}
          className={`px-3 py-1.5 text-[10px] font-medium rounded-full transition-all duration-200 ${
            language === lang.code
              ? 'bg-white dark:bg-white text-slate-900 dark:text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {getShortName(lang.code)}
        </button>
      ))}
    </div>
  )
}
