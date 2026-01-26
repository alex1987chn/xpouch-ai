import React, { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import SwipeBackIndicator from './SwipeBackIndicator'

// 统一的卡片基础样式定义，彻底告别 /80
const cardBaseStyles = cn(
  "transition-all duration-300 overflow-hidden rounded-2xl",
  // Light Mode: 纯白实色，轻微灰色边框，柔和投影
  "bg-white border-slate-200/60 shadow-xl shadow-slate-200/50",
  // Dark Mode: 深色实色，深色边框，取消投影，增加内发光
  "dark:bg-slate-900 dark:border-slate-800 dark:shadow-none dark:ring-1 dark:ring-white/5"
);

interface XPouchLayoutProps {
  ExpertBarContent: React.ReactNode // 专家状态栏
  ArtifactContent: React.ReactNode // Artifact显示区域
  ChatContent: (viewMode: 'chat' | 'preview', setViewMode: (mode: 'chat' | 'preview') => void) => React.ReactNode
  swipeProgress?: number
  hasArtifact?: boolean
  hideChatPanel?: boolean
  showExpertBar?: boolean // 是否显示专家状态栏（仅复杂模式）
  isSidebarOpen?: boolean // 侧边栏是否打开（用于调整宽度比例）
}

export default function XPouchLayout({
  ExpertBarContent,
  ArtifactContent,
  ChatContent,
  swipeProgress = 0,
  hasArtifact = true, // 默认始终显示Artifacts
  hideChatPanel = false,
  showExpertBar = false, // 默认不显示专家状态栏
  isSidebarOpen = false // 默认侧边栏关闭
}: XPouchLayoutProps) {
  // 优化3：改用固定宽度策略，避免百分比计算的脆弱性
  // Chat Panel: 使用固定宽度范围，根据屏幕尺寸调整
  // 移动端：w-full, PC端：380-420px固定宽度
  const chatPanelWidthClass = isSidebarOpen
    ? 'md:w-[380px]'  // 侧边栏打开时稍微窄一点
    : 'md:w-[420px]'  // 侧边栏关闭时更宽

  // viewMode 仅在移动端起作用
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')

  return (
    /* 第1层：底座背景 - 增加一点对比度 */
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-100 dark:bg-slate-950 p-2 md:p-4">
      {/* 第2层：透明布局容器 */}
      <div
        className={cn(
          'relative flex flex-col md:flex-row overflow-hidden h-full w-full transition-all duration-300 ease-in-out',
          'bg-transparent',
          'md:gap-4'
        )}
      >
        {/* 移动端滑动返回指示器 */}
        <SwipeBackIndicator swipeProgress={swipeProgress} />

        {/* Chat Panel - 最终优化样式 */}
        <AnimatePresence mode="wait">
          {(!hideChatPanel || viewMode === 'chat') && (
            <aside
              className={cn(
                'flex-none flex flex-col transition-all duration-300',
                // 基础背景：彻底放弃半透明，解决灰色尖角
                'bg-white dark:bg-slate-900',
                // 响应式：移动端铺满，PC端赋予圆角和边框
                'fixed inset-0 z-50 md:relative md:h-full md:rounded-2xl',
                // 边框细节：使用更细腻的 60% 不透明度
                'md:border md:border-slate-200/60 md:dark:border-slate-800',
                // 投影细节：使用扩散范围大但色彩极淡的阴影，模拟自然光，黑暗模式下关闭投影改用 Ring
                'md:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.08)] dark:md:shadow-none dark:md:ring-1 dark:md:ring-white/5',
                'overflow-hidden',
                // 移动端全屏显示
                viewMode === 'chat' ? 'w-full h-full rounded-none border-none' : 'hidden',
                // PC端布局
                'md:flex',
                chatPanelWidthClass,
                hideChatPanel && 'hidden'
              )}
            >
              <div className="h-full w-full flex flex-col overflow-hidden">
                {ChatContent(viewMode, setViewMode)}
              </div>
            </aside>
          )}
        </AnimatePresence>

        {/* Delivery Zone - 这里的 min-w-0 解决了溢出 */}
        {(showExpertBar || hasArtifact) && (
          <div
            id="expert-delivery-zone"
            className="flex-1 min-w-0 flex flex-col gap-4 bg-transparent overflow-hidden hidden md:flex"
          >
            {/* 专家状态栏 */}
            {showExpertBar && (
              <section className={cn("flex-none w-full max-h-[180px]", cardBaseStyles)}>
                <div className="h-full overflow-y-auto overflow-x-hidden p-2">
                  {ExpertBarContent}
                </div>
              </section>
            )}

            {/* Artifacts区域 - 使用absolute定位防止溢出 */}
            {hasArtifact && (
              <section className={cn("flex-1 min-h-0 relative", cardBaseStyles)}>
                {/* 使用 absolute inset-0 强制子组件只能在容器范围内渲染 */}
                <div className="absolute inset-0 overflow-hidden">
                  {ArtifactContent}
                </div>
              </section>
            )}
          </div>
        )}

        {/* 移动端预览模式内容 */}
        <AnimatePresence mode="wait">
          {viewMode === 'preview' && (
            <div className="fixed inset-0 z-40 md:hidden bg-slate-100 dark:bg-slate-950">
              <div className="absolute top-4 left-4 z-50">
                <button
                  onClick={() => setViewMode('chat')}
                  className={cn(
                    'w-28 h-8 rounded-full flex items-center justify-center gap-2 px-3 transition-all',
                    // 实色背景，避免半透明
                    'bg-white dark:bg-slate-900',
                    'border border-slate-200 dark:border-slate-800',
                    'hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">对话</span>
                </button>
              </div>

              {/* 移动端：专家状态栏 - 仅复杂模式显示 */}
              {showExpertBar && (
                <div className={cn(
                  "absolute top-4 right-4 z-50 p-4 rounded-2xl",
                  cardBaseStyles,
                  "max-w-[calc(100%-4rem)]"
                )}>
                  {ExpertBarContent}
                </div>
              )}

              {/* 移动端：Artifacts显示区域 - 始终显示 */}
              <div className={cn(
                'h-full w-full flex flex-col',
                showExpertBar ? 'pt-24' : 'pt-16'
              )}>
                <div className="flex-1 overflow-auto p-4">
                  {ArtifactContent}
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
