import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

interface XPouchLayoutProps {
  SidebarContent: React.ReactNode
  CanvasContent: React.ReactNode
  ChatContent: (viewMode: 'chat' | 'preview', setViewMode: (mode: 'chat' | 'preview') => void) => React.ReactNode
  isChatMinimized?: boolean
  setIsChatMinimized?: (minimized: boolean) => void
  swipeProgress?: number
}

export default function XPouchLayout({
  SidebarContent,
  CanvasContent,
  ChatContent,
  isChatMinimized = false,
  setIsChatMinimized,
  swipeProgress = 0
}: XPouchLayoutProps) {
  // viewMode 仅在移动端起作用
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden">

      {/* 1. 侧边栏 - 固定宽度 92px */}
      <aside className="hidden md:flex h-screen flex-shrink-0 w-[92px] border-r border-slate-200/50 backdrop-blur-xl">
        <div className="h-full w-full">
          {SidebarContent}
        </div>
      </aside>

      {/* 主容器 */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* 移动端滑动返回指示器 */}
        {swipeProgress > 0 && (
          <div
            className="md:hidden absolute left-0 top-0 bottom-0 flex items-center justify-center bg-gradient-to-r from-indigo-500/30 to-transparent backdrop-blur-sm pointer-events-none z-50 transition-all"
            style={{ width: `${Math.min(swipeProgress, 150)}px` }}
          >
            <ArrowLeft className="w-8 h-8 text-indigo-600 ml-3 opacity-90" />
          </div>
        )}

        {/* 2. 画布区域 (Canvas) */}
        {/* 移动端逻辑：仅在 preview 模式显示 | PC端逻辑：始终作为背景 flex-1 */}
        <main className={cn(
          'flex flex-1 relative h-full w-full overflow-y-auto overflow-x-hidden',
          viewMode === 'preview' ? 'flex' : 'hidden',
          'md:flex'
        )}>
          {/* 移动端：画布顶部的切换按钮（仅在 preview 模式显示） */}
          {viewMode === 'preview' && (
            <button
              onClick={() => setViewMode('chat')}
              className="md:hidden absolute top-4 left-1/2 -translate-x-1/2 z-50 w-28 h-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full shadow-lg flex items-center justify-center gap-2 px-3 hover:bg-white dark:hover:bg-slate-800 transition-all"
            >
              <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">对话</span>
            </button>
          )}

          {CanvasContent}
        </main>

        {/* 4. 聊天面板 (Chat Panel) - 完整封装 */}
        {/* 移动端逻辑：仅在 chat 模式全屏显示 | PC端逻辑：固定定位悬浮 */}
        <aside className={cn(
          // 基础样式
          'flex flex-col bg-white dark:bg-slate-900/90 backdrop-blur-md z-50',
          // 移动端样式
          viewMode === 'chat' ? 'w-full h-full static' : 'hidden',
          // PC端样式：固定定位悬浮 + 收起动画
          'md:flex md:fixed md:right-6 md:top-6 md:bottom-6 md:w-[400px]',
          'md:h-auto md:rounded-2xl md:shadow-2xl md:border md:border-slate-200/50 dark:md:border-slate-700/50 md:overflow-hidden md:bg-white dark:md:bg-slate-900/90 md:backdrop-blur-md',
          // 关键：收起动画样式
          'transition-all duration-300 ease-in-out',
          isChatMinimized && 'md:translate-x-[110%] md:opacity-0 md:pointer-events-none'
        )}>
          {ChatContent(viewMode, setViewMode)}
        </aside>

        {/* 机器人恢复按钮：仅在收起时显示 */}
        {isChatMinimized && setIsChatMinimized && (
          <button
            onClick={() => setIsChatMinimized(false)}
            className="hidden md:flex fixed bottom-10 right-10 z-[100] w-14 h-14 bg-gradient-to-br from-violet-500 to-blue-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-105 transition-transform animate-bounce"
            title="恢复对话"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
        )}

      </div>
    </div>
  );
}
