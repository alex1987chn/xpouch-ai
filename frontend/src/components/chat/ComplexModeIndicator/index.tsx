/**
 * =============================
 * 复杂模式指示器 (ComplexModeIndicator)
 * =============================
 *
 * [架构层级] Layer 5 - 状态指示组件
 *
 * [设计风格] Industrial Terminal
 * - 重型边框、机械感
 * - 黄色强调色 (#facc15)
 * - 等宽字体、终端风格
 * - 脉冲动画表示处理中
 *
 * [用途]
 * 当后端 Router 决策为 complex 模式时显示，
 * 提示用户 AI 正在协调多个专家进行复杂任务处理。
 */

import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { Cpu, Terminal } from 'lucide-react'

interface ComplexModeIndicatorProps {
  /** 当前激活的专家 */
  activeExpert?: string | null
  /** 是否正在处理 */
  isProcessing?: boolean
  /** 额外样式 */
  className?: string
}

/**
 * 复杂模式状态指示器
 *
 * 设计特点：
 * - 左侧黄色边框强调
 * - 顶部状态标签
 * - 旋转齿轮动画
 * - 当前活跃专家显示
 */
export default function ComplexModeIndicator({
  activeExpert,
  isProcessing = true,
  className,
}: ComplexModeIndicatorProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        // 布局
        'flex flex-col items-start w-full max-w-3xl ml-4 pl-4',
        // 左侧装饰边框
        'border-l-[3px] border-l-[var(--accent)]',
        // 底部间距
        'pb-4',
        className
      )}
    >
      {/* 主容器：工业卡片风格 */}
      <div className="bg-card border-2 border-border shadow-hard relative overflow-hidden">
        {/* 顶部状态条 */}
        <div className="h-1 w-full bg-[var(--accent)] animate-pulse" />

        {/* 内容区域 */}
        <div className="px-4 py-3 flex items-center gap-4">
          {/* 左侧：旋转图标 */}
          <div className="relative flex-shrink-0">
            {/* 外圈旋转 */}
            <div className="w-8 h-8 border-2 border-border border-t-[var(--accent)] animate-spin">
              <Cpu className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--accent)]" />
            </div>
          </div>

          {/* 中间：状态文本 */}
          <div className="flex flex-col gap-1">
            {/* 主标题 */}
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-[var(--accent)]" />
              <span className="font-mono text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
                Complex Mode Active
              </span>
            </div>

            {/* 副标题：任务拆解提示 */}
            <span className="font-mono text-[10px] text-primary/70 uppercase">
              {t('detectingComplexTask')}
            </span>

            {/* 活跃专家（如果有） */}
            {activeExpert && (
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[9px] text-primary/50 uppercase">
                  Active Expert:
                </span>
                <span className="font-mono text-[9px] px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 uppercase">
                  {activeExpert}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 右下角装饰标签 */}
        <div className="absolute bottom-0 right-0 bg-[var(--accent)] text-primary font-mono text-[8px] px-1.5 py-0.5 font-bold">
          PROCESSING
        </div>
      </div>
    </div>
  )
}
