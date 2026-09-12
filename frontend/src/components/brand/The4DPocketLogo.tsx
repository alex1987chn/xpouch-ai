import "./The4DPocketLogo.css";

interface The4DPocketLogoProps {
  className?: string
}

/**
 * 品牌标志动画：黄卡片落入蓝口袋 + 口袋回弹（纯 CSS keyframes，
 * 见 The4DPocketLogo.css）。全局 prefers-reduced-motion 会将其压为静态定格
 * （卡片停在口袋中）。
 */
export function The4DPocketLogo({ className }: The4DPocketLogoProps) {
  return (
    <div
      className={`relative w-[42px] h-[42px] ${className || ""}`}
      style={{ overflow: "visible" }}
    >
      {/* 掉落的卡片 (Pocket Item) */}
      <div
        className="absolute left-[13px] w-4 h-4 border-2 border-border z-[5]"
        style={{
          top: "10px",
          opacity: 1,
          backgroundColor: "var(--logo-item, #facc15)",
          animation: "logo-drop 2.5s ease-in-out infinite",
          willChange: "transform, opacity, top",
        }}
      />

      {/* 口袋底座 (Pocket Base) */}
      <div
        className="absolute bottom-2 left-[3px] w-9 h-5 border-2 border-t-0 border-border z-10"
        style={{
          backgroundColor: "var(--logo-base, #2563eb)",
          borderBottomLeftRadius: "18px",
          borderBottomRightRadius: "18px",
          transformOrigin: "bottom center",
          animation: "logo-recoil 3s ease-in-out infinite",
          willChange: "transform",
        }}
      />
    </div>
  )
}
