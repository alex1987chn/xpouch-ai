/**
 * ============================================
 * ThemeShowcase - 主题系统展示
 * ============================================
 * 
 * 用于测试和演示语义化颜色系统
 * 展示所有语义变量在不同主题下的表现
 */

import { useThemeStore, THEMES } from '@/store/themeStore'
import { cn } from '@/lib/utils'

export function ThemeShowcase() {
  const { theme } = useThemeStore()
  const currentTheme = THEMES.find(t => t.id === theme)

  return (
    <div className="p-6 space-y-8 bg-surface-page min-h-screen">
      {/* 标题 */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-content-primary">
          主题系统展示
        </h1>
        <p className="text-content-secondary">
          当前主题：<span className="font-medium text-accent">{currentTheme?.name}</span>
        </p>
      </div>

      {/* Surface 层级 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">Surface - 表面层级</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ColorCard 
            name="surface-page" 
            className="bg-surface-page border-border-default"
            description="页面底色"
          />
          <ColorCard 
            name="surface-card" 
            className="bg-surface-card border-border-default shadow-hard"
            description="卡片背景"
          />
          <ColorCard 
            name="surface-elevated" 
            className="bg-surface-elevated border-border-default"
            description="提升表面"
          />
          <ColorCard 
            name="surface-input" 
            className="bg-surface-input border-border-default"
            description="输入框背景"
          />
        </div>
      </section>

      {/* Content 文字颜色 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">Content - 文字颜色</h2>
        <div className="bg-surface-card p-4 rounded-lg border-2 border-border-default space-y-3">
          <p className="text-content-primary text-lg font-medium">
            content-primary：主标题文字
          </p>
          <p className="text-content-secondary">
            content-secondary：次要文字和描述
          </p>
          <p className="text-content-muted">
            content-muted：占位符和辅助信息
          </p>
          <div className="bg-surface-overlay p-3 rounded">
            <p className="text-content-inverted">
              content-inverted：深色背景上的反色文字
            </p>
          </div>
        </div>
      </section>

      {/* Border 边框 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">Border - 边框颜色</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <BorderCard name="border-default" className="border-border-default" />
          <BorderCard name="border-hover" className="border-border-hover" />
          <BorderCard name="border-focus" className="border-border-focus" />
          <BorderCard name="border-divider" className="border-border-divider" />
        </div>
      </section>

      {/* Accent 强调色 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">Accent - 强调色</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AccentCard 
            name="accent-brand" 
            bgClass="bg-accent" 
            textClass="text-accent"
          />
          <AccentCard 
            name="accent-hover" 
            bgClass="bg-accent-hover" 
            textClass="text-accent-hover"
          />
          <AccentCard 
            name="accent-active" 
            bgClass="bg-accent-active" 
            textClass="text-accent-active"
          />
          <AccentCard 
            name="accent-destructive" 
            bgClass="bg-accent-destructive" 
            textClass="text-accent-destructive"
          />
        </div>
      </section>

      {/* 阴影系统 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">Shadow - 阴影系统</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ShadowCard name="shadow-hard-sm" className="shadow-hard-sm" />
          <ShadowCard name="shadow-hard" className="shadow-hard" />
          <ShadowCard name="shadow-hard-lg" className="shadow-hard-lg" />
          <ShadowCard name="shadow-glow" className="shadow-glow" />
        </div>
      </section>

      {/* 透明度支持 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">
          透明度支持（RGB 格式优势）
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <OpacityCard opacity="100%" className="bg-surface-card" />
          <OpacityCard opacity="75%" className="bg-surface-card/75" />
          <OpacityCard opacity="50%" className="bg-surface-card/50" />
          <OpacityCard opacity="25%" className="bg-surface-card/25" />
        </div>
      </section>

      {/* 交互元素 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">交互元素测试</h2>
        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 bg-accent text-content-inverted rounded hover:bg-accent-hover transition-colors">
            主要按钮
          </button>
          <button className="px-4 py-2 bg-surface-card border-2 border-border-default text-content-primary rounded hover:bg-surface-elevated transition-colors">
            次要按钮
          </button>
          <button className="px-4 py-2 border-2 border-accent-destructive text-accent-destructive rounded hover:bg-accent-destructive hover:text-content-inverted transition-colors">
            危险按钮
          </button>
          <button className="px-4 py-2 text-content-muted hover:text-content-primary transition-colors">
            幽灵按钮
          </button>
        </div>
      </section>

      {/* 禁用状态 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">禁用状态</h2>
        <div className="flex flex-wrap gap-3">
          <button disabled className="px-4 py-2 bg-surface-elevated text-content-disabled rounded cursor-not-allowed">
            禁用按钮
          </button>
          <input 
            disabled 
            placeholder="禁用输入框" 
            className="px-3 py-2 bg-surface-elevated border border-border-disabled text-content-disabled rounded cursor-not-allowed"
          />
        </div>
      </section>
    </div>
  )
}

// 颜色卡片组件
function ColorCard({ name, className, description }: { name: string, className: string, description: string }) {
  return (
    <div className={cn('p-4 rounded-lg border-2', className)}>
      <div className="text-xs font-mono text-content-secondary mb-1">{name}</div>
      <div className="text-sm text-content-primary">{description}</div>
    </div>
  )
}

// 边框卡片组件
function BorderCard({ name, className }: { name: string, className: string }) {
  return (
    <div className={cn('p-4 rounded-lg border-2 bg-surface-card', className)}>
      <div className="text-xs font-mono text-content-secondary">{name}</div>
    </div>
  )
}

// 强调色卡片组件
function AccentCard({ name, bgClass, textClass }: { name: string, bgClass: string, textClass: string }) {
  return (
    <div className="space-y-2">
      <div className={cn('h-16 rounded-lg flex items-center justify-center', bgClass)}>
        <span className="text-sm font-medium text-content-inverted">{name}</span>
      </div>
      <p className={cn('text-center text-sm', textClass)}>文字示例</p>
    </div>
  )
}

// 阴影卡片组件
function ShadowCard({ name, className }: { name: string, className: string }) {
  return (
    <div className={cn('p-4 rounded-lg bg-surface-card border-2 border-border-default', className)}>
      <div className="text-xs font-mono text-content-secondary">{name}</div>
    </div>
  )
}

// 透明度卡片组件
function OpacityCard({ opacity, className }: { opacity: string, className: string }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 bg-surface-overlay rounded" />
      <div className={cn('relative p-4 rounded border-2 border-border-default', className)}>
        <div className="text-sm font-medium text-content-primary">{opacity}</div>
      </div>
    </div>
  )
}
