import { useState, lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import { Maximize2, LayoutGrid, FileCode, Terminal, Cpu, Database, Search, Globe, Palette, Braces } from 'lucide-react'
import type { Artifact } from '@/types'
import type { ExpertResult } from '@/store/canvasStore'
import { useTranslation } from '@/i18n'

// Artifact 组件懒加载 - 按需加载重型库
const CodeArtifact = lazy(() => import('@/components/artifacts/CodeArtifact').then(m => ({ default: m.default })))
const DocArtifact = lazy(() => import('@/components/artifacts/DocArtifact').then(m => ({ default: m.default })))
const HtmlArtifact = lazy(() => import('@/components/artifacts/HtmlArtifact').then(m => ({ default: m.default })))
const SearchArtifact = lazy(() => import('@/components/artifacts/SearchArtifact').then(m => ({ default: m.default })))
const TextArtifact = lazy(() => import('@/components/artifacts/TextArtifact').then(m => ({ default: m.default })))

// 专家图标映射
const expertIcons: Record<string, React.ReactNode> = {
  search: <Search className="w-4 h-4" />,
  coder: <Terminal className="w-4 h-4" />,
  researcher: <FileCode className="w-4 h-4" />,
  analyzer: <Database className="w-4 h-4" />,
  writer: <Braces className="w-4 h-4" />,
  planner: <Globe className="w-4 h-4" />,
  designer: <Palette className="w-4 h-4" />,
  architect: <Cpu className="w-4 h-4" />,
  default: <Cpu className="w-4 h-4" />,
}

// 专家标签映射
const expertLabels: Record<string, string> = {
  search: 'SRCH',
  coder: 'CODE',
  researcher: 'RSCH',
  analyzer: 'DATA',
  writer: 'WRT',
  planner: 'PLAN',
  designer: 'DSGN',
  architect: 'ARC',
  default: 'AGENT',
}

interface OrchestratorPanelProps {
  /** 专家列表 */
  experts: ExpertResult[]
  /** 当前活跃专家ID */
  activeExpertId: string | null
  /** 点击专家回调 */
  onExpertClick: (expertId: string) => void
  /** Artifacts 列表 */
  artifacts: Artifact[]
  /** 当前选中的 Artifact */
  selectedArtifact: Artifact | null
  /** 点击 Artifact 回调 */
  onArtifactClick: (artifact: Artifact) => void
  /** 是否全屏 */
  isFullscreen?: boolean
  /** 切换全屏回调 */
  onToggleFullscreen?: () => void
}

/**
 * 右侧编排器面板 - Industrial Style
 * 
 * 包含：
 * 1. 专家轨道 (ExpertRail) - 左侧窄栏
 * 2. Artifact 仪表盘 (ArtifactDashboard) - 主内容区
 */
export default function OrchestratorPanel({
  experts,
  activeExpertId,
  onExpertClick,
  artifacts,
  selectedArtifact,
  onArtifactClick,
  isFullscreen,
  onToggleFullscreen,
}: OrchestratorPanelProps) {
  return (
    <>
      {/* 专家轨道 - 左侧窄栏 */}
      <ExpertRail
        experts={experts}
        activeExpertId={activeExpertId}
        onExpertClick={onExpertClick}
      />

      {/* Artifact 仪表盘 - 主内容区 */}
      <ArtifactDashboard
        artifacts={artifacts}
        selectedArtifact={selectedArtifact}
        onArtifactClick={onArtifactClick}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />
    </>
  )
}

// ============ 子组件 ============

/** 专家轨道 */
function ExpertRail({
  experts,
  activeExpertId,
  onExpertClick,
}: {
  experts: ExpertResult[]
  activeExpertId: string | null
  onExpertClick: (expertId: string) => void
}) {
  // 去重并确保有默认专家
  const uniqueExperts = experts.length > 0 
    ? experts 
    : [{ expertType: 'architect', status: 'completed' as const, expertName: 'Architect', description: '' }] as ExpertResult[]

  return (
    <div className="w-14 border-r-2 border-border bg-page flex flex-col items-center py-2 z-10 shrink-0">
      {/* 顶部装饰线 */}
      <div className="w-[1px] h-4 bg-border/50 mb-2" />

      {/* 专家头像列表 */}
      <div className="flex-1 flex flex-col items-center gap-3 overflow-y-auto scrollbar-hide py-2">
        {uniqueExperts.map((expert, index) => {
          const expertId = expert.expertType
          const isActive = activeExpertId === expertId || 
                          (activeExpertId === null && index === 0)
          const label = expertLabels[expert.expertType] || expertLabels.default

          return (
            <div 
              key={expertId} 
              className="group relative w-full flex justify-center"
            >
              {/* 活跃指示条 */}
              {isActive && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-border z-20" />
              )}

              {/* 头像按钮 */}
              <button
                onClick={() => onExpertClick(expertId)}
                className={cn(
                  "w-10 h-10 border-2 flex items-center justify-center transition-all relative z-10",
                  isActive
                    ? "border-border bg-card shadow-[2px_2px_0_0_rgba(0,0,0,0.2)] hover:bg-[var(--accent)]"
                    : "border-border/70 bg-page hover:opacity-80 hover:border-border hover:bg-card"
                )}
              >
                <span className={cn(
                  "font-black text-xs",
                  isActive ? "text-primary" : "text-secondary dark:text-primary/60"
                )}>
                  {label}
                </span>
              </button>

              {/* Tooltip */}
              <div className={cn(
                "absolute left-14 top-2 bg-primary text-inverted text-[9px] px-2 py-1 whitespace-nowrap z-50",
                "opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
              )}>
                {expert.title || `${expert.expertType} (${expert.status})`}
              </div>
            </div>
          )
        })}
      </div>

      {/* 底部装饰线 */}
      <div className="flex-1 w-[1px] bg-border/30 border-l border-dashed border-border/30 min-h-[20px]" />
    </div>
  )
}

/** Artifact 仪表盘 */
function ArtifactDashboard({
  artifacts,
  selectedArtifact,
  onArtifactClick,
  isFullscreen,
  onToggleFullscreen,
}: {
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  onArtifactClick: (artifact: Artifact) => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<string>(() => {
    // 如果有 artifacts，默认选中第一个；否则显示概览
    return selectedArtifact?.id || (artifacts.length > 0 ? artifacts[0].id : 'overview')
  })

  // 如果有选中的 artifact，显示它；否则显示第一个 artifact 或概览
  const currentArtifact = selectedArtifact || (artifacts.length > 0 ? artifacts[0] : null)

  // 当没有 artifacts 时才显示概览标签
  const showOverviewTab = artifacts.length === 0

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-page">
      {/* Tab 栏 */}
      <div className="h-10 flex items-end px-2 gap-1 border-b-2 border-border bg-panel shrink-0 overflow-x-auto scrollbar-hide">
        {/* 概览 Tab - 仅在没有 artifacts 时显示 */}
        {showOverviewTab && (
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "h-8 px-4 flex items-center gap-2 relative transition-all",
              activeTab === 'overview'
                ? "bg-card border-2 border-border border-b-0 top-[2px] z-10"
                : "h-7 px-4 bg-panel border-2 border-border/30 border-b-0 opacity-60 hover:opacity-100"
            )}
          >
            <LayoutGrid className="w-3 h-3" />
            <span className="font-mono text-xs font-bold">{t('overview')}</span>
          </button>
        )}

        {/* Artifact Tabs - 仅在有 artifacts 时显示 */}
        {!showOverviewTab && artifacts.slice(0, 3).map((artifact) => (
          <button
            key={artifact.id}
            onClick={() => {
              setActiveTab(artifact.id)
              onArtifactClick(artifact)
            }}
            className={cn(
              "h-7 px-4 flex items-center gap-2 transition-all",
              activeTab === artifact.id
                ? "h-8 bg-card border-2 border-border border-b-0 top-[2px] z-10"
                : "bg-panel border-2 border-border/30 border-b-0 opacity-60 hover:opacity-100"
            )}
          >
            <FileCode className="w-3 h-3" />
            <span className="font-mono text-xs font-bold truncate max-w-[80px]">
              {artifact.title}
            </span>
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 bg-card p-4 overflow-hidden relative">
        {/* 点阵背景 */}
        <div className="absolute inset-0 dot-grid opacity-30 dark:opacity-20 pointer-events-none" />

        {/* 内容容器 */}
        <div className="w-full h-full border border-border bg-card shadow-sm relative flex flex-col">
          {/* 标题栏 */}
          <div className="flex justify-between items-center p-3 border-b border-border bg-panel shrink-0">
            <h3 className="font-bold uppercase text-xs flex items-center gap-2">
              {activeTab === 'overview' ? (
                <><LayoutGrid className="w-3 h-3" /> {t('ganttViewTitle')}</>
              ) : (
                <><FileCode className="w-3 h-3" /> {currentArtifact?.title}</>
              )}
            </h3>
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full border border-border bg-red-400" />
              <div className="w-3 h-3 rounded-full border border-border bg-yellow-400" />
              <div className="w-3 h-3 rounded-full border border-border bg-green-400" />
            </div>
          </div>

          {/* 内容体 */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'overview' || !currentArtifact ? (
              <EmptyState />
            ) : (
              <ArtifactContent artifact={currentArtifact} />
            )}
          </div>

          {/* 底部操作栏 */}
          {currentArtifact && (
            <div className="absolute bottom-4 right-4">
              <button
                onClick={onToggleFullscreen}
                className="px-4 py-2 bg-primary text-inverted font-mono text-xs hover:bg-[var(--accent)] hover:text-primary border-2 border-transparent hover:border-border transition-colors shadow-hard flex items-center gap-2"
              >
                {isFullscreen ? (
                  <><span className="text-lg leading-none">−</span> {t('exitFullscreen')}</>
                ) : (
                  <><Maximize2 className="w-3 h-3" /> {t('openFullscreen')}</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="bg-primary text-inverted border-t-2 border-border px-3 py-1.5 flex justify-between items-center text-[9px] font-mono shrink-0">
        <div className="flex gap-4">
          <span className="text-inverted">CPU: 12%</span>
          <span className="text-inverted">MEM: 402MB</span>
          <span className="text-[var(--accent)]">NET: CONNECTED</span>
        </div>
        <span className="text-inverted">Ln 1, Col 1</span>
      </div>
    </div>
  )
}

/** 空状态 - 占位效果 */
function EmptyState() {
  const { t } = useTranslation()

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-border/30 bg-panel/50">
      <div className="text-center space-y-6">
        {/* 图标 */}
        <div className="flex justify-center">
          <div className="w-16 h-16 border-2 border-border bg-card shadow-hard flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-secondary" />
          </div>
        </div>

        {/* 标题 */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
            {t('noArtifactsTitle') || 'No Artifacts Yet'}
          </h3>
          <p className="text-xs text-secondary max-w-sm mx-auto leading-relaxed">
            {t('noArtifactsDesc') || 'Waiting for experts to generate deliverables. Artifacts will appear here once the task is in progress.'}
          </p>
        </div>

        {/* 装饰性元素 */}
        <div className="flex justify-center gap-2 pt-4">
          <div className="w-2 h-2 bg-border/30" />
          <div className="w-2 h-2 bg-border/50" />
          <div className="w-2 h-2 bg-[var(--accent)]" />
          <div className="w-2 h-2 bg-border/50" />
          <div className="w-2 h-2 bg-border/30" />
        </div>

        {/* 技术装饰 */}
        <div className="pt-4 border-t border-border/20">
          <div className="text-[9px] font-mono text-secondary/60">
            STATUS: <span className="text-[var(--accent)]">WAITING_FOR_TASK</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Artifact 内容渲染 */
function ArtifactContent({ artifact }: { artifact: Artifact }) {
  const { t } = useTranslation()
  // Artifact 加载状态
  const ArtifactLoader = () => (
    <div className="h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-xs text-secondary font-mono">
        <div className="w-2 h-2 bg-[var(--accent)] animate-pulse" />
        <span>{t('loadingModule')}</span>
      </div>
    </div>
  )

  // 根据 artifact 类型渲染不同内容
  const renderContent = () => {
    switch (artifact.type) {
      case 'code':
        return (
          <Suspense fallback={<ArtifactLoader />}>
            <CodeArtifact content={artifact.content} language={artifact.language} />
          </Suspense>
        )
      case 'markdown':
        return (
          <Suspense fallback={<ArtifactLoader />}>
            <DocArtifact content={artifact.content} />
          </Suspense>
        )
      case 'html':
        return (
          <Suspense fallback={<ArtifactLoader />}>
            <HtmlArtifact content={artifact.content} />
          </Suspense>
        )
      case 'search':
        return (
          <Suspense fallback={<ArtifactLoader />}>
            <SearchArtifact content={artifact.content} />
          </Suspense>
        )
      case 'text':
        return (
          <Suspense fallback={<ArtifactLoader />}>
            <TextArtifact content={artifact.content} />
          </Suspense>
        )
      default:
        return (
          <div className="p-4 bg-page border border-dashed border-border/30 text-secondary text-sm">
            {artifact.content}
          </div>
        )
    }
  }

  return (
    <div className="h-full">
      {renderContent()}
    </div>
  )
}
