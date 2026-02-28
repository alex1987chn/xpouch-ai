import { useTranslation, type Language } from '@/i18n'
import { languages } from '@/constants/languages'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

interface LanguageSelectorProps {
  className?: string
}

export function LanguageSelector({ className }: LanguageSelectorProps) {
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
      className={cn("bg-surface-elevated rounded-full p-0.5 w-fit", className)}
    >
      {languages.map((lang) => (
        <ToggleGroupItem
          key={lang.code}
          value={lang.code}
          aria-label={lang.name}
          className="text-[9px] font-medium min-w-[32px] h-7 px-2"
        >
          {getShortName(lang.code)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
