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

interface PixelLetterProps {
  data: readonly (readonly number[])[]
  colorLight: string
  colorDark: string
  baseDelay: number
}

function PixelLetter({ data, colorLight, colorDark, baseDelay }: PixelLetterProps) {
  return (
    <div className="grid gap-[2px] sm:gap-[2.5px] md:gap-[3px]" style={{ gridTemplateColumns: `repeat(${data[0].length}, 1fr)` }}>
      {data.flat().map((pixel, i) => (
        <div
          key={i}
          className={`w-1 h-1 sm:w-1.5 sm:h-1.5 md:w-1.5 md:h-1.5 rounded-[2px] transition-all duration-500 backdrop-blur-sm dark:opacity-90 animate-pixelFallIn animate-pulse-glow ${
            pixel
              ? `${colorLight} dark:${colorDark} shadow-[0_0_10px_rgba(139,92,246,0.3)]`
              : 'bg-transparent'
          }`}
          style={{
            animationDelay: `${baseDelay + (i * 0.025)}s`
          }}
        />
      ))}
    </div>
  )
}

export default function PixelLetters() {
  return (
    <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-2.5 md:gap-3 transform transition-all origin-center px-2 scale-75 md:scale-80">
      <div className="flex gap-[2px] sm:gap-[2.5px]">
        <PixelLetter data={pixelData.X} colorLight="bg-blue-400/85" colorDark="bg-sky-400/85" baseDelay={0.0} />
        <PixelLetter data={pixelData.P} colorLight="bg-indigo-500/85" colorDark="bg-purple-500/85" baseDelay={0.12} />
        <PixelLetter data={pixelData.o} colorLight="bg-violet-500/85" colorDark="bg-fuchsia-500/85" baseDelay={0.24} />
        <PixelLetter data={pixelData.u} colorLight="bg-indigo-500/85" colorDark="bg-purple-500/85" baseDelay={0.36} />
        <PixelLetter data={pixelData.c} colorLight="bg-violet-500/85" colorDark="bg-fuchsia-500/85" baseDelay={0.48} />
        <PixelLetter data={pixelData.h} colorLight="bg-violet-500/85" colorDark="bg-fuchsia-500/85" baseDelay={0.60} />
      </div>
      <div className="flex gap-[2px] sm:gap-[2.5px] ml-3 sm:ml-6 md:ml-9">
        <PixelLetter data={pixelData.A} colorLight="bg-indigo-500/85" colorDark="bg-purple-500/85" baseDelay={0.72} />
        <PixelLetter data={pixelData.I} colorLight="bg-violet-500/85" colorDark="bg-fuchsia-500/85" baseDelay={0.84} />
      </div>
    </div>
  )
}
