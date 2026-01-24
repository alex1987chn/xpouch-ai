import { useMemo } from 'react'

// 像素配置
const PIXEL_SIZE = 4
const GAP = 1

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

function getDynamicColor(progress: number): { bg: string, glow: string } {
  if (progress < 0.3) {
    return {
      bg: 'bg-sky-400/85',
      glow: '0 0 10px rgba(56, 189, 248, 0.5)'
    }
  } else if (progress < 0.7) {
    return {
      bg: 'bg-indigo-400/85',
      glow: '0 0 10px rgba(129, 140, 248, 0.5)'
    }
  } else {
    return {
      bg: 'bg-violet-500/85',
      glow: '0 0 10px rgba(67, 56, 202, 0.5)'
    }
  }
}

interface PixelNodeProps {
  row: number
  col: number
  color: { bg: string, glow: string }
}

function PixelNode({ row, col, color }: PixelNodeProps) {
  return (
    <div
      className={`absolute rounded-sm backdrop-blur-sm ${color.bg}`}
      style={{
        width: PIXEL_SIZE,
        height: PIXEL_SIZE,
        left: col * (PIXEL_SIZE + GAP),
        top: row * (PIXEL_SIZE + GAP),
        boxShadow: color.glow,
      }}
    />
  )
}

interface LetterContainerProps {
  data: readonly (readonly number[])[]
  startPixelIndex: number
  totalPixels: number
  letterKey: string
}

function LetterContainer({ data, startPixelIndex, totalPixels, letterKey }: LetterContainerProps) {
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
      {pixels.map((p, i) => (
        <PixelNode key={`${letterKey}-${i}`} {...p} />
      ))}
    </div>
  )
}

export default function PixelLettersStatic() {
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

  const { counts, totalPixels } = pixelCounts
  const letterSpacing = PIXEL_SIZE
  const groupSpacing = 28

  return (
    <div className="flex flex-row items-center justify-center px-1" style={{ gap: `${letterSpacing}px` }}>
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
