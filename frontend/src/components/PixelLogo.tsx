import { useState } from 'react'
import { cn } from '@/lib/utils'

interface PixelLogoProps {
  size?: number
  className?: string
  variant?: 'pouch' | 'p-letter' | 'box'
}

/**
 * 像素点阵图案库
 * 1 = 填充像素（蓝紫渐变）
 * 0 = 空白像素（透明）
 */

// 方案1：口袋形状（Pouch）- 7x7 矩阵，上开口的袋子，中间 X 镂空
const POUCH_PATTERN = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 1, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [0, 1, 1, 1, 1, 1, 0],
]

// 方案2：字母 P - 7x7 矩阵，品牌首字母
const P_LETTER_PATTERN = [
  [1, 1, 1, 1, 1, 0, 0],
  [1, 0, 0, 0, 0, 1, 0],
  [1, 0, 0, 0, 0, 1, 0],
  [1, 1, 1, 1, 1, 0, 0],
  [1, 0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0],
]

// 方案3：魔方/宝箱 - 7x7 矩阵，神秘感
const BOX_PATTERN = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 1, 0, 1, 0, 1, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 1, 0, 1, 0, 1, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
]

const PATTERNS = {
  pouch: POUCH_PATTERN,
  'p-letter': P_LETTER_PATTERN,
  box: BOX_PATTERN,
}

// 渐变色映射（从上到下，从左到右渐变）- 适配 7x7 矩阵
const getGradientColor = (row: number, col: number, isHovered: boolean) => {
  if (!isHovered) {
    // 静态渐变：从蓝到紫
    const progress = (row + col) / 12 // 0 到 1 (7+7-2=12)
    const hue = 220 - progress * 40 // 从蓝色(220)到紫色(180)
    const saturation = 70 + progress * 10 // 饱和度增加
    const lightness = 55 - progress * 5 // 亮度微调
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  } else {
    // Hover 流光效果：增强饱和度和亮度
    const progress = (row + col) / 12
    const hue = 220 - progress * 40
    const saturation = 85 + progress * 10
    const lightness = 60 - progress * 5
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  }
}

export default function PixelLogo({ size = 32, className, variant = 'pouch' }: PixelLogoProps) {
  const [isHovered, setIsHovered] = useState(false)
  const PIXEL_PATTERN = PATTERNS[variant]

  return (
    <div
      className={cn(
        'relative inline-block cursor-pointer transition-all duration-300',
        'hover:scale-110',
        className
      )}
      style={{
        width: size,
        height: size,
        filter: isHovered
          ? 'drop-shadow(0 0 16px rgba(139, 92, 246, 0.8))'
          : 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.4))',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* CSS Grid 点阵 - 7x7 矩阵 */}
      <div
        className="grid gap-[1.5px] w-full h-full rounded-md overflow-hidden"
        style={{
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: 'repeat(7, 1fr)',
          backgroundColor: 'rgba(15, 23, 42, 0.3)', // 微弱深色背景
        }}
      >
        {PIXEL_PATTERN.map((row, rowIndex) =>
          row.map((pixel, colIndex) => {
            const key = `${rowIndex}-${colIndex}`
            const isActive = pixel === 1
            
            return (
              <div
                key={key}
                className={cn(
                  'rounded-sm transition-all',
                  isActive ? 'opacity-100' : 'opacity-0',
                  isHovered && isActive && 'animate-pulse-glow'
                )}
                style={{
                  backgroundColor: isActive
                    ? getGradientColor(rowIndex, colIndex, isHovered)
                    : 'transparent',
                  animationDelay: isHovered ? `${(rowIndex + colIndex) * 60}ms` : '0ms',
                  transitionDuration: '400ms',
                  transform: isHovered && isActive ? 'scale(1.05)' : 'scale(1)',
                }}
              />
            )
          })
        )}
      </div>

      {/* Hover 流光效果背景 */}
      {isHovered && (
        <div
          className="absolute inset-0 rounded-md -z-10 animate-pulse"
          style={{
            background: 'radial-gradient(circle at center, rgba(139, 92, 246, 0.25) 0%, transparent 70%)',
            animationDuration: '1.5s',
          }}
        />
      )}
    </div>
  )
}
