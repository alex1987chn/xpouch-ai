import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import SwipeBackIndicator from './SwipeBackIndicator'

interface XPouchLayoutProps {
  SidebarContent: React.ReactNode
  ExpertBarContent: React.ReactNode // 专家状态栏
  ArtifactContent: React.ReactNode // Artifact显示区域
  ChatContent: (viewMode: 'chat' | 'preview', setViewMode: (mode: 'chat' | 'preview') => void) => React.ReactNode
  isChatMinimized?: boolean
  setIsChatMinimized?: (minimized: boolean) => void
  swipeProgress?: number
  hasArtifact?: boolean
  hideChatPanel?: boolean
}

export default function XPouchLayout({
  SidebarContent,
  ExpertBarContent,
  ArtifactContent,
  ChatContent,
  isChatMinimized = false,
  setIsChatMinimized,
  swipeProgress = 0,
  hasArtifact = false,
  hideChatPanel = false
}: XPouchLayoutProps) {
  // viewMode 仅在移动端起作用
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden">

      {/* 1. 侧边栏 - 固定宽度 92px，统一样式，z-index 确保全局优先级 */}
      <aside className="hidden md:flex h-screen flex-shrink-0 w-[92px] bg-gradient-to-b from-slate-700 to-slate-900 dark:from-[#1e293b] dark:to-[#0f172a] backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-700/30 relative z-[150]">
        <div className="h-full w-full">
          {SidebarContent}
        </div>
      </aside>

      {/* 主容器 - 三区布局：左侧专家区（bar + artifact），右侧聊天区 */}
      <motion.div
        layout
        className={cn(
          'relative flex flex-col md:flex-row overflow-hidden h-full w-full',
          hasArtifact
            ? 'flex-1 md:p-4 md:gap-4' // PC端：有 artifact 时显示 padding 和 gap
            : 'flex-1' // 无 artifact 时使用
        )}
      >
        {/* 移动端滑动返回指示器 */}
        <SwipeBackIndicator swipeProgress={swipeProgress} />

        {/* 背景网格画布 - 始终存在 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 -z-10">
          {/* 可以在这里添加网格背景 */}
        </div>

        {/* 左侧专家区 - 包含专家状态栏和Artifact区域 */}
        <AnimatePresence mode="wait">
          <motion.main
            key={viewMode}
            layout={hasArtifact} // 只在有 artifact 时启用 layout
            initial={false}
            animate={{
              flex: hasArtifact ? 1 : 1,
              width: hasArtifact ? 'auto' : '100%'
            }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], layout: { duration: 0.4 } }}
            className={cn(
              'relative flex-shrink-0 md:flex-1 h-full overflow-hidden min-h-0',
              viewMode === 'chat' ? 'hidden md:flex' : 'flex md:flex-1',
              // 有 artifact 时：深色面板，圆角，边框（仅 PC 端）
              hasArtifact && 'bg-[#0B0E14] md:rounded-2xl md:border md:border-slate-800 md:shadow-2xl',
              // 无 artifact 时：透明，显示背景网格（仅 PC 端圆角）
              !hasArtifact && 'md:rounded-2xl'
            )}
          >
            {/* 移动端：画布顶部的切换按钮（仅在 preview 模式显示） */}
            {viewMode === 'preview' && (
              <button
                onClick={() => setViewMode('chat')}
                className="md:hidden absolute top-4 left-1/2 -translate-x-1/2 z-[60] w-28 h-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full shadow-lg flex items-center justify-center gap-2 px-3 hover:bg-white dark:hover:bg-slate-800 transition-all"
              >
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">对话</span>
              </button>
            )}

            {/* Canvas 内容容器 - flex column布局 */}
            <div className={cn(
              'h-full w-full flex flex-col',
              viewMode === 'preview' ? 'block' : 'hidden',
              'md:block'
            )}>
              {/* 专家状态栏 - 顶部，固定高度 */}
              <div className="relative z-20 flex-shrink-0 px-4 pt-4 pb-2">
                {ExpertBarContent}
              </div>

              {/* Artifact显示区域 - 占据剩余空间 */}
              <div className="flex-1 overflow-auto relative z-10">
                <div className="w-full h-full px-4 pb-4">
                  {ArtifactContent}
                </div>
              </div>
            </div>
          </motion.main>
        </AnimatePresence>

        {/* Chat Panel - 右侧 */}
        <AnimatePresence mode="wait">
          {(!hideChatPanel || viewMode === 'chat') && (
            <motion.aside
              key="chat-panel"
              layout={hasArtifact} // 只在有 artifact 时启用 layout
              initial={false}
              animate={{
                width: hasArtifact ? '400px' : '400px',
                flexShrink: 0
              }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], layout: { duration: 0.4 } }}
              className={cn(
                // 基础样式
                'flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md',
                // 移动端：全屏显示（使用 fixed 脱离文档流，避免受父容器影响）
                'fixed inset-0 z-50 md:relative',
                viewMode === 'chat' ? 'w-full h-[100dvh] rounded-none border-none' : 'hidden',
                // PC端样式：统一样式，保持视觉一致
                'md:flex md:w-[400px] md:h-full md:rounded-2xl md:shadow-2xl md:shadow-black/20 md:border md:border-slate-200/50 md:dark:border-slate-700/50',
                // 关键：overflow-hidden 确保圆角锐利，只有内部消息区域滚动
                'overflow-hidden min-h-0',
                isChatMinimized && 'md:w-0 md:opacity-0 md:overflow-hidden md:pointer-events-none',
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
            </motion.aside>
          )}
        </AnimatePresence>

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

      </motion.div>
    </div>
  );
}
