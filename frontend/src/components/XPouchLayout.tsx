import React, { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import SwipeBackIndicator from './SwipeBackIndicator'

interface XPouchLayoutProps {
  ExpertBarContent: React.ReactNode // 专家状态栏
  ArtifactContent: React.ReactNode // Artifact显示区域
  ChatContent: (viewMode: 'chat' | 'preview', setViewMode: (mode: 'chat' | 'preview') => void) => React.ReactNode
  isChatMinimized?: boolean
  setIsChatMinimized?: (minimized: boolean) => void
  swipeProgress?: number
  hasArtifact?: boolean
  hideChatPanel?: boolean
  showExpertBar?: boolean // 是否显示专家状态栏（仅复杂模式）
}

export default function XPouchLayout({
  ExpertBarContent,
  ArtifactContent,
  ChatContent,
  isChatMinimized = false,
  setIsChatMinimized,
  swipeProgress = 0,
  hasArtifact = true, // 默认始终显示Artifacts
  hideChatPanel = false,
  showExpertBar = false // 默认不显示专家状态栏
}: XPouchLayoutProps) {
  // viewMode 仅在移动端起作用
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      {/* 主容器 - 左右并列布局 */}
      <div
        className={cn(
          'relative flex flex-col md:flex-row overflow-hidden h-full w-full',
          'p-4 md:gap-4' // PC端：统一的 padding (16px) 和 gap
        )}
      >
        {/* 移动端滑动返回指示器 */}
        <SwipeBackIndicator swipeProgress={swipeProgress} />

        {/* 背景网格画布 - 始终存在 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 -z-10">
          {/* 可以在这里添加网格背景 */}
        </div>

        {/* Chat Panel - 左侧，占 3 份（约 30%） */}
        <AnimatePresence mode="wait">
          {(!hideChatPanel || viewMode === 'chat') && (
            <aside
              className={cn(
                // 基础样式
                'flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md',
                // 移动端：全屏显示
                'fixed inset-0 z-50 md:relative',
                viewMode === 'chat' ? 'w-full h-[100dvh] rounded-none border-none' : 'hidden',
                // PC端样式：固定30%宽度，使用精确的百分比
                'md:flex md:w-[30%] md:min-w-[30%] md:max-w-[30%] md:h-full md:rounded-2xl md:shadow-2xl md:shadow-black/20 md:border md:border-slate-200/50 md:dark:border-slate-700/50',
                // 关键：overflow-hidden 确保圆角锐利，只有内部消息区域滚动
                'overflow-hidden min-h-0',
                isChatMinimized && 'md:flex-0 md:opacity-0 md:overflow-hidden md:pointer-events-none',
                // 全屏预览时隐藏
                hideChatPanel && 'hidden'
              )}
            >
              <div className={cn(
                'h-full w-full flex flex-col overflow-hidden',
                isChatMinimized && 'md:opacity-0'
              )}>
                {ChatContent(viewMode, setViewMode)}
              </div>
            </aside>
          )}
        </AnimatePresence>

        {/* 右侧容器：专家状态栏 + Artifacts区域，占 7 份（约 70%） */}
        {(showExpertBar || hasArtifact) && (
          <div
            id="expert-delivery-zone"
            className={cn(
              'relative flex flex-col gap-4 min-h-0',
              'hidden md:flex md:w-[70%] md:min-w-[70%] md:max-w-[70%]', // PC端显示，固定70%宽度
              'md:flex' // PC端显示
            )}
          >
          {/* 专家状态栏 - 仅复杂模式显示 */}
          {showExpertBar && (
            <section
              className={cn(
                'relative w-full h-auto max-h-[180px] overflow-hidden',
                'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md',
                'rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-2xl shadow-black/20'
              )}
            >
              <div className="h-full overflow-y-auto overflow-x-hidden">
                {ExpertBarContent}
              </div>
            </section>
          )}

          {/* Artifacts区域 - 始终显示（所有对话都可能生成需要展示的内容） */}
          {hasArtifact && (
            <section
              className={cn(
                'relative w-full flex-1 min-h-0 overflow-hidden',
                'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md',
                'rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-2xl shadow-black/20'
              )}
            >
              {ArtifactContent}
            </section>
          )}
        </div>
        )}

        {/* 机器人恢复按钮：仅在收起时显示 */}
        {isChatMinimized && setIsChatMinimized && (
          <button
            onClick={() => setIsChatMinimized(false)}
            className="hidden md:flex fixed bottom-10 right-10 w-14 h-14 bg-gradient-to-br from-violet-500 to-blue-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-105 transition-transform animate-bounce"
            title="恢复对话"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
        )}

        {/* 移动端预览模式内容 */}
        <AnimatePresence mode="wait">
          {viewMode === 'preview' && (
            <div
              className={cn(
                'fixed inset-0 z-40 md:hidden',
                'bg-slate-50 dark:bg-slate-950'
              )}
            >
              <div className="absolute top-4 left-4 z-50">
                <button
                  onClick={() => setViewMode('chat')}
                  className="w-28 h-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full shadow-lg flex items-center justify-center gap-2 px-3 hover:bg-white dark:hover:bg-slate-800 transition-all"
                >
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">对话</span>
                </button>
              </div>

              {/* 移动端：专家状态栏 - 仅复杂模式显示 */}
              {showExpertBar && (
                <div className="absolute top-4 right-4 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-2xl shadow-black/20">
                  <div className="p-4">
                    {ExpertBarContent}
                  </div>
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
