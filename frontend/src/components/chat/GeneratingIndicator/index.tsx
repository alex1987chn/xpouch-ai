/**
 * 生成中指示器 (GeneratingIndicator)
 * 显示 AI 正在处理请求的动画状态
 *
 * [设计风格] Industrial Terminal
 * - 重型边框、机械感
 * - 黄色强调色
 * - 等宽字体、终端风格
 * - 脉冲动画表示处理中
 *
 * [功能]
 * - simple 模式：显示 Processing
 * - complex 模式：显示 Complex Mode Active（多专家协作）
 */

import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { Cpu, Loader2, Terminal } from 'lucide-react'

interface GeneratingIndicatorProps {
  /** 对话模式 */
  mode?: 'simple' | 'complex'
  /** 额外样式 */
  className?: string
}

export default function GeneratingIndicator({
  mode = 'simple',
  className
}: GeneratingIndicatorProps) {
  const { t } = useTranslation()

  // 根据模式配置
  const config = mode === 'complex'
    ? {
        icon: <Terminal className="w-3 h-3 text-accent-brand" />,
        title: 'Complex Mode Active',
        subtitle: t('detectingComplexTask'),
      }
    : {
        icon: <Loader2 className="w-3 h-3 text-accent-brand animate-spin" />,
        title: 'Processing',
        subtitle: t('analyzingRequestStream'),
      }

  return (
    <div
      className={cn(
        // 布局
        'flex flex-col items-start w-full max-w-3xl ml-4 pl-4',
        // 左侧装饰边框
        'border-l-[2px] border-l-accent-brand',
        // 底部间距
        'pb-4',
        className
      )}
    >
      {/* 主容器：工业卡片风格 */}
      <div className="bg-card border border-border shadow-sm relative overflow-hidden">
        {/* 顶部状态条（简化） */}
        <div className="h-[2px] w-full bg-accent-brand/60" />

        {/* 内容区域 */}
        <div className="px-4 py-3 flex items-center gap-4">
          {/* 左侧：旋转图标 */}
          <div className="relative flex-shrink-0">
            {/* 外圈旋转 */}
            <div className="w-8 h-8 border border-border border-t-accent-brand animate-spin">
              <Cpu className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent-brand" />
            </div>
          </div>

          {/* 右侧：状态文本 */}
          <div className="flex flex-col gap-1">
            {/* 主标题 */}
            <div className="flex items-center gap-2">
              {config.icon}
              <span className="font-mono text-xs font-bold text-accent-brand uppercase tracking-wider">
                {config.title}
              </span>
            </div>

            {/* 副标题：详细说明 */}
            <span className="font-mono text-[10px] text-primary/70 uppercase">
              {config.subtitle}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
