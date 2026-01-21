import { useState, forwardRef } from 'react'
import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CheckCircle2, Clock2, AlertCircle, X, RefreshCw, Info } from 'lucide-react'
import { useCanvasStore, type ExpertResult } from '@/store/canvasStore'
import { useTranslation } from '@/i18n'
import { getExpertConfig } from '@/constants/systemAgents'

// 专家详情预览卡片
function ExpertPreviewModal({ expert, onClose }: { expert: ExpertResult; onClose: () => void }) {
  const { t } = useTranslation()
  const config = getExpertConfig(expert.expertType)

  // 优先使用 AI 返回的自定义标题，否则使用默认名称
  const displayName = expert.title || config.name

  const statusColors = {
    pending: 'bg-gray-200 dark:bg-gray-700',
    running: 'bg-green-500 animate-pulse',
    completed: 'bg-green-500',
    failed: 'bg-red-500'
  }

  const statusIcons = {
    pending: null,
    running: <Clock2 className="w-5 h-5 text-white" />,
    completed: <CheckCircle2 className="w-5 h-5 text-white" />,
    failed: <AlertCircle className="w-5 h-5 text-white" />
  }

  // 性能优化：使用 will-change 提示浏览器
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* 预览卡片 - 性能优化 */}
      <motion.div
        initial={{ opacity: 0, transform: 'scale(0.95)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        exit={{ opacity: 0, transform: 'scale(0.95)' }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ willChange: 'transform, opacity' }}
        className={cn(
          'relative max-w-lg rounded-2xl shadow-2xl overflow-hidden',
          'bg-white dark:bg-slate-800',
          'border border-gray-200 dark:border-slate-700',
          'w-full' // 单独一行，避免与其他类混在一起影响性能
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 - 性能优化：移除渐变，使用纯色 */}
        <div className={cn(
          'p-6 border-b',
          'bg-white dark:bg-slate-800',
          'border-gray-200 dark:border-slate-700'
        )}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* 状态指示灯 */}
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center shadow-lg',
                statusColors[expert.status]
              )}>
                {statusIcons[expert.status]}
              </div>

              {/* 专家信息 */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{config.icon}</span>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {displayName}
                  </h3>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className={cn(
                    'text-sm font-medium',
                    expert.status === 'completed' && 'text-green-600 dark:text-green-400',
                    expert.status === 'running' && 'text-blue-600 dark:text-blue-400',
                    expert.status === 'failed' && 'text-red-600 dark:text-red-400',
                    expert.status === 'pending' && 'text-gray-600 dark:text-gray-400'
                  )}>
                    {expert.status === 'pending' && '等待中'}
                    {expert.status === 'running' && '执行中'}
                    {expert.status === 'completed' && '已完成'}
                    {expert.status === 'failed' && '执行失败'}
                  </span>
                  {expert.duration && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">•</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        耗时 {(expert.duration / 1000).toFixed(2)}s
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* 内容区域 - 性能优化：移出动画，使用 div */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* 任务描述 */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              <Info className="w-4 h-4 text-indigo-500" />
              {t('taskDescription')}
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg">
              {expert.description}
            </p>
          </div>

          {/* 输出结果 */}
          {expert.output && (
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                输出结果
              </h4>
              <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                {expert.output}
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {expert.error && (
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
                <AlertCircle className="w-4 h-4" />
                错误信息
              </h4>
              <div className="text-sm text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-900/20 p-3 rounded-lg whitespace-pre-wrap">
                {expert.error}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        {expert.status === 'failed' && (
          <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
            <button
              onClick={() => {
                onClose()
                useCanvasStore.getState().retryExpert(expert.expertType)
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重试任务
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// 专家卡片组件（简化版）
const ExpertCard = React.forwardRef<HTMLDivElement, {
  expert: ExpertResult
  onClick: () => void
}>(({ expert, onClick }, ref) => {
  const config = getExpertConfig(expert.expertType)

  // 优先使用 AI 返回的自定义标题，否则使用默认名称
  const displayName = expert.title || config.name

  const statusColors = {
    pending: 'bg-gray-200 dark:bg-gray-700',
    running: 'bg-green-500 animate-pulse',
    completed: 'bg-green-500',
    failed: 'bg-red-500'
  }

  const statusIcons = {
    pending: null,
    running: <Clock2 className="w-3 h-3 text-white" />,
    completed: <CheckCircle2 className="w-3 h-3 text-white" />,
    failed: <AlertCircle className="w-3 h-3 text-white" />
  }

  return (
    <div
      ref={ref}
      className={cn(
        'flex-shrink-0 cursor-pointer transition-all duration-300',
        expert.status === 'failed' && 'ring-2 ring-red-500 ring-opacity-50'
      )}
      onClick={onClick}
    >
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all duration-300',
        'bg-white dark:bg-slate-800',
        'hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        expert.status === 'running' && 'border-green-400 shadow-green-500/20',
        expert.status === 'completed' && 'border-green-400',
        expert.status === 'failed' && 'border-red-400',
        expert.status === 'pending' && 'border-gray-200 dark:border-gray-700'
      )}>
        {/* 状态指示灯 */}
        <div className={cn(
          'w-2.5 h-2.5 rounded-full flex items-center justify-center',
          statusColors[expert.status]
        )}>
          {statusIcons[expert.status]}
        </div>

        {/* 专家图标 */}
        <span className="text-sm">{config.icon}</span>

        {/* 专家名称 */}
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
          {displayName}
        </span>
      </div>
    </div>
  )
})

ExpertCard.displayName = 'ExpertCard'

interface ExpertStatusBarProps {
  previewExpert: ExpertResult | null
  setPreviewExpert: (expert: ExpertResult | null) => void
}

export default function ExpertStatusBar({ previewExpert, setPreviewExpert }: ExpertStatusBarProps) {
  const { t } = useTranslation()
  const { expertResults, selectedExpert, selectExpert, clearExpertResults } = useCanvasStore()

  // 按执行顺序排序专家
  const sortedExperts = [...expertResults].sort((a, b) => {
    const order = ['pending', 'running', 'completed', 'failed']
    return order.indexOf(a.status) - order.indexOf(b.status)
  })

  return (
    <>
      {/* 专家状态栏容器 */}
      <div
        className={cn(
          'flex items-center gap-3 overflow-x-auto pb-2 min-h-[60px] px-4 py-3',
          'bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm',
          'rounded-2xl border border-gray-200 dark:border-slate-700',
          'shadow-lg'
        )}
      >
        {/* 空状态提示 */}
        {sortedExperts.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse"></span>
            <span>等待专家调度...</span>
          </div>
        )}

        {sortedExperts.map((expert) => (
          <ExpertCard
            key={expert.expertType}
            expert={expert}
            onClick={() => {
              selectExpert(expert.expertType)
              setPreviewExpert(expert)
            }}
          />
        ))}

        {/* 清除按钮 */}
        {sortedExperts.length > 0 && (
          <button
            onClick={() => {
              clearExpertResults()
              setPreviewExpert(null)
            }}
            className="ml-auto px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            {t('clear')}
          </button>
        )}
      </div>
    </>
  )
}

// 导出预览弹窗组件供外部使用
export { ExpertPreviewModal }
