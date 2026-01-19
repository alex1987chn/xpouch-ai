import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface FloatingExpertBarProps {
  activeExpertId: string | null
}

// 专家配置
const EXPERT_CONFIG: Record<string, { name: string; icon: string }> = {
  search: { name: '搜索', icon: '🔍' },
  coder: { name: '编程', icon: '💻' },
  researcher: { name: '研究', icon: '📚' },
  analyzer: { name: '分析', icon: '📊' },
  writer: { name: '写作', icon: '✍️' },
  planner: { name: '规划', icon: '📋' }
}

function FloatingExpertBar({ activeExpertId }: FloatingExpertBarProps) {
  // 生成 16x16 像素图标
  const getPixelIcon = (expertId: string, isActive: boolean) => {
    const config = EXPERT_CONFIG[expertId]
    if (!config) return null

    return (
      <div
        className={cn(
          'relative w-4 h-4 transition-all duration-300',
          isActive && 'animate-pulse'
        )}
        title={config.name}
      >
        {/* 像素点阵背景 */}
        <div
          className={cn(
            'absolute inset-0 grid grid-cols-4 grid-rows-4 gap-[1px] rounded-sm',
            isActive && 'bg-gradient-to-r from-blue-400 to-purple-500 opacity-90'
          )}
        >
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-1 h-1',
                isActive ? 'bg-white/70' : 'bg-slate-400/40'
              )}
            />
          ))}
        </div>
        {/* 中心 Emoji */}
        <span className="absolute inset-0 flex items-center justify-center text-[8px] leading-none select-none">
          {config.icon}
        </span>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: -20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="absolute top-0 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 h-8
                 bg-slate-900/60 backdrop-blur-md rounded-full border border-slate-700/50
                 shadow-lg"
    >
      <AnimatePresence mode="popLayout">
        {(Object.keys(EXPERT_CONFIG) as string[]).map((expertId) => {
          const isActive = activeExpertId === expertId
          return (
            <motion.div
              key={expertId}
              layout
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'relative',
                !isActive && 'opacity-40'
              )}
            >
              {getPixelIcon(expertId, isActive)}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </motion.div>
  )
}

export default memo(FloatingExpertBar)
