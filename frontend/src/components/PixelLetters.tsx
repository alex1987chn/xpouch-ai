import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'

// 像素配置
const PIXEL_SIZE = 6  // 调整像素尺寸
const GAP = 1.6  // 像素间距

const pixelData = {
  X: [
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,1,0,1,0],
    [1,0,0,0,1]
  ],
  P: [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0]
  ],
  o: [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0]
  ],
  u: [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,1]
  ],
  c: [
    [0,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [0,1,1,1,0]
  ],
  h: [
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1]
  ],
  A: [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1]
  ],
  I: [
    [1,1,1,1,1],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [1,1,1,1,1]
  ]
} as const

/**
 * 计算从四面八方吸附的随机起点
 * 使用圆周分布，确保从屏幕外飞入
 */
function getRandomOffset() {
  if (typeof window === 'undefined') {
    return { x: -1000, y: -1000 }
  }
  const angle = Math.random() * Math.PI * 2
  const distance = Math.max(window.innerWidth, window.innerHeight)
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  }
}

/**
 * 根据像素在Logo中的相对位置计算颜色（平滑渐变）
 * 0% - 30%: Sky 400 (#38BDF8)
 * 30% - 70%: Indigo 400 (#818CF8)
 * 70% - 100%: Violet 500 (#8B5CF6) + Indigo 700 Glow - 科技紫
 */
function getDynamicColor(progress: number): { bg: string, glow: string } {
  // progress: 0 ~ 1
  if (progress < 0.3) {
    // Sky 400 (#38BDF8)
    return {
      bg: 'bg-sky-400/85',
      glow: '0 0 10px rgba(56, 189, 248, 0.5)'
    }
  } else if (progress < 0.7) {
    // Indigo 400 (#818CF8)
    return {
      bg: 'bg-indigo-400/85',
      glow: '0 0 10px rgba(129, 140, 248, 0.5)'
    }
  } else {
    // Violet 500 (#8B5CF6) + Indigo 700 (#4338CA) Glow - 柔和发光效果
    return {
      bg: 'bg-violet-500/85',
      glow: '0 0 10px rgba(67, 56, 202, 0.5)'
    }
  }
}

// ============================================================================
// 最内层：PixelNode - 单个像素粒子
// ============================================================================

interface PixelNodeProps {
  row: number
  col: number
  color: { bg: string, glow: string }  // 像素颜色和发光
}

function PixelNode({ row, col, color }: PixelNodeProps) {
  // 每个像素都有自己独立的随机起点
  const randomStart = useMemo(() => getRandomOffset(), [])

  return (
    <motion.div
      className={`absolute rounded-sm backdrop-blur-sm transform-gpu ${color.bg}`}
      style={{
        width: PIXEL_SIZE,
        height: PIXEL_SIZE,
        // 关键：坐标相对于 LetterContainer
        left: col * (PIXEL_SIZE + GAP),
        top: row * (PIXEL_SIZE + GAP),
        willChange: 'transform, opacity',
        boxShadow: color.glow,
        backfaceVisibility: 'hidden',
        perspective: '1000px',
      }}
      initial={{
        x: randomStart.x,
        y: randomStart.y,
        opacity: 0,
        scale: 0,
      }}
      animate={{
        x: 0,
        y: 0,
        opacity: 1,
        scale: 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 35,
        damping: 20,
        delay: Math.random() * 0.6,
      }}
    />
  )
}

// ============================================================================
// 中间层：LetterContainer - 每个字母的容器（relative 定位）
// ============================================================================

interface LetterContainerProps {
  data: readonly (readonly number[])[]
  startPixelIndex: number  // 该字母第一个像素的全局索引
  totalPixels: number  // Logo的总像素数
  letterKey: string
}

function LetterContainer({ data, startPixelIndex, totalPixels, letterKey }: LetterContainerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  // 使用 useMemo 锁定像素数组，防止重绘时重新计算随机位置
  const pixels = useMemo(() => {
    const result: PixelNodeProps[] = []
    let currentPixelIndex = startPixelIndex

    data.forEach((row, rowIndex) => {
      row.forEach((pixel, colIndex) => {
        if (pixel === 1) {
          const progress = currentPixelIndex / totalPixels
          const color = getDynamicColor(progress)
          result.push({
            row: rowIndex,
            col: colIndex,
            color: color,
          })
          currentPixelIndex++
        }
      })
    })
    return result
  }, [data, startPixelIndex, totalPixels, letterKey])

  return (
    <div
      className="relative"
      style={{
        width: data[0].length * (PIXEL_SIZE + GAP),
        height: data.length * (PIXEL_SIZE + GAP),
      }}
    >
      {mounted && pixels.map((p, i) => (
        <PixelNode key={`${letterKey}-${i}`} {...p} />
      ))}
    </div>
  )
}

// ============================================================================
// 最外层：LogoWrapper - flex 布局，水平排列所有字母
// ============================================================================

export default function PixelLetters() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 计算Logo的总像素数和每个字母的起始像素索引
  const pixelCounts = useMemo(() => {
    const letters = ['X', 'P', 'o', 'u', 'c', 'h', 'A', 'I']
    const counts: { letter: string, count: number, startIndex: number }[] = []
    let totalPixels = 0

    letters.forEach((letter) => {
      const data = pixelData[letter as keyof typeof pixelData]
      const count = data.flat().filter((p) => p === 1).length
      counts.push({
        letter,
        count,
        startIndex: totalPixels
      })
      totalPixels += count
    })

    return { counts, totalPixels }
  }, [])

  if (!mounted) {
    return null // 避免 SSR 问题
  }

  const { counts, totalPixels } = pixelCounts
  const letterSpacing = PIXEL_SIZE  // 字母间距调整为1倍（6px）
  const groupSpacing = 28  // XPOUCH和AI之间的间距调整为28px

  return (
    <div className="flex flex-row items-center justify-center transform transition-all origin-center px-1 scale-75 sm:scale-90 md:scale-110 transform-gpu" style={{ gap: `${letterSpacing}px` }}>
      {counts.map((item) => (
        <div
          key={item.letter}
          style={{ marginLeft: item.letter === 'A' ? `${groupSpacing}px` : undefined }}
        >
          <LetterContainer
            data={pixelData[item.letter as keyof typeof pixelData]}
            startPixelIndex={item.startIndex}
            totalPixels={totalPixels}
            letterKey={item.letter}
          />
        </div>
      ))}
    </div>
  )
}
