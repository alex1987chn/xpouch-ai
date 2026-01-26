import React, { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import SwipeBackIndicator from './SwipeBackIndicator'

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
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 p-2 md:p-4">
      {/* 主容器 - 添加transition实现动画协同 */}
      <div
        className={cn(
          'relative flex flex-col md:flex-row overflow-hidden h-full w-full transition-all duration-300 ease-in-out',
          'bg-slate-50 dark:bg-slate-950', // 与最外层保持一致
          'md:gap-4' // PC端：gap(16px)，移动端：无gap（已经有外层padding）
        )}
      >
        {/* 移动端滑动返回指示器 */}
        <SwipeBackIndicator swipeProgress={swipeProgress} />

        {/* Chat Panel - 左侧，使用flex-none确保不收缩 */}
        <AnimatePresence mode="wait">
          {(!hideChatPanel || viewMode === 'chat') && (
            <aside
              className={cn(
                // 基础样式：flex-none确保不收缩
                'flex-none flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-md',
                // 移动端：全屏显示
                'fixed inset-0 z-50 md:relative',
                viewMode === 'chat' ? 'w-full h-[100dvh] rounded-none border-none' : 'hidden',
                // PC端样式：使用clamp实现智能宽度
                'md:flex transition-all duration-300',
                chatPanelWidthClass,
                'md:h-full md:rounded-2xl md:shadow-2xl md:shadow-black/20 md:border md:border-slate-200/50 md:dark:border-slate-700/50',
                // 关键：overflow-hidden 确保圆角锐利，只有内部消息区域滚动
                'overflow-hidden min-h-0',
                // 全屏预览时隐藏
                hideChatPanel && 'hidden'
              )}
            >
              <div className="h-full w-full flex flex-col overflow-hidden">
                {ChatContent(viewMode, setViewMode)}
              </div>
            </aside>
          )}
        </AnimatePresence>

        {/* 右侧容器：专家状态栏 + Artifacts区域，强制弹性化 */}
        {(showExpertBar || hasArtifact) && (
          <div
            id="expert-delivery-zone"
            className={cn(
              'relative flex flex-col gap-2 overflow-hidden', // 添加overflow-hidden
              'hidden md:flex',
              'flex-1 min-w-0' // 关键：必须min-w-0才能随着剩余空间缩减
            )}
          >
          {/* 专家状态栏 - 仅复杂模式显示，使用flex-none防止被压缩 */}
          {showExpertBar && (
            <section
              className={cn(
                'relative w-full flex-none max-h-[180px] overflow-hidden', // flex-none确保不被压缩
                'bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm',
                'rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-2xl shadow-black/20'
              )}
            >
              <div className="h-full overflow-y-auto overflow-x-hidden p-2">
                {ExpertBarContent}
              </div>
            </section>
          )}

          {/* Artifacts区域 - 使用flex-1填满剩余空间，强制overflow-hidden */}
          {hasArtifact && (
            <section
              className={cn(
                'relative w-full flex-1 min-h-0 overflow-hidden', // 强制overflow-hidden
                'bg-white/80 dark:bg-slate-900/80 backdrop-blur-md',
                'rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-2xl shadow-black/20'
              )}
            >
              {ArtifactContent}
            </section>
          )}
        </div>
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
