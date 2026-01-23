import { useTranslation, type Language } from '@/i18n'
import { languages } from '@/constants/languages'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
    <ToggleGroup
      type="single"
      value={language}
      onValueChange={(value) => value && setLanguage(value as Language)}
      className="bg-slate-200 dark:bg-slate-700 rounded-full p-1 w-fit"
    >
      {languages.map((lang) => (
        <ToggleGroupItem
          key={lang.code}
          value={lang.code}
          aria-label={lang.name}
          className="text-[10px] font-medium"
        >
          {getShortName(lang.code)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
