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
  color: string
}

function PixelLetter({ data, color }: PixelLetterProps) {
  return (
    <div className="grid gap-px sm:gap-1" style={{ gridTemplateColumns: `repeat(${data[0].length}, 1fr)` }}>
      {data.flat().map((pixel, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-2.5 md:h-2.5 rounded-sm transition-all duration-300 ${pixel ? `${color} backdrop-blur-sm shadow-[0_2px_4px_rgba(0,0,0,0.2)]` : 'bg-transparent'}`}
        />
      ))}
    </div>
  )
}

export default function PixelLetters() {
  return (
    <div className="flex flex-wrap justify-center items-center gap-1.5 sm:gap-2 md:gap-3 transform transition-all origin-center px-2">
      <div className="flex gap-px sm:gap-1">
        <PixelLetter data={pixelData.X} color="bg-indigo-500/80" />
        <PixelLetter data={pixelData.P} color="bg-purple-500/80" />
        <PixelLetter data={pixelData.o} color="bg-pink-500/80" />
        <PixelLetter data={pixelData.u} color="bg-orange-500/80" />
        <PixelLetter data={pixelData.c} color="bg-yellow-500/80" />
        <PixelLetter data={pixelData.h} color="bg-cyan-500/80" />
      </div>
      <div className="flex gap-px sm:gap-1 ml-2 sm:ml-5 md:ml-7">
        <PixelLetter data={pixelData.A} color="bg-green-500/80" />
        <PixelLetter data={pixelData.I} color="bg-blue-500/80" />
      </div>
    </div>
  )
}
