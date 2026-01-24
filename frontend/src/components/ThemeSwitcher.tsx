import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { Switch } from '@/components/ui/switch'

interface ThemeSwitcherProps {
  className?: string
}

export function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className={`flex items-center gap-1.5 ${className || ''}`}>
      <Sun className="w-3 h-3 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
      <Switch
        checked={theme === 'dark'}
        onCheckedChange={toggleTheme}
        aria-label="Toggle theme"
        className="flex-shrink-0 scale-90"
      />
      <Moon className="w-3 h-3 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
    </div>
  )
}
