import { VERSION } from '@/constants/ui'

interface SystemStatusMarqueeProps {
  className?: string
  speed?: number
}

export function SystemStatusMarquee({
  className,
  speed = 20,
}: SystemStatusMarqueeProps) {
  const statusText =
    `/// SYSTEM STATUS: ONLINE /// CONNECTED TO NEURAL NET /// WAITING FOR INSTRUCTION /// ${VERSION.FULL} /// `

  return (
    <div
      className={`w-full overflow-hidden whitespace-nowrap ${className || ""}`}
    >
      <div
        className="inline-block text-xs font-bold text-content-secondary"
        style={{
          animation: `marquee ${speed}s linear infinite`,
          willChange: "transform",
        }}
      >
        {/* Duplicate content for seamless loop */}
        <span>{statusText}</span>
        <span>{statusText}</span>
      </div>

      <style>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  )
}
