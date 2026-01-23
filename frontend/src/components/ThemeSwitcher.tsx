import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { Switch } from '@/components/ui/switch'

interface ThemeSwitcherProps {
  className?: string
}

export function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className={`flex items-center justify-center ${className || ''}`}>
      <Sun className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300 mr-2" />
      <Switch
        checked={theme === 'dark'}
        onCheckedChange={toggleTheme}
        aria-label="Toggle theme"
      />
      <Moon className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300 ml-2" />
    </div>
  )
}
