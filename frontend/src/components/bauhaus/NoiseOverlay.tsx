import { cn } from "@/lib/utils"

/**
 * NoiseOverlay - 噪点纹理覆盖层
 *
 * 复刻 xpouch_ultra_refined.html 中的 .texture-overlay：
 * - 全屏固定定位
 * - SVG 噪点纹理
 * - pointer-events-none (不阻挡点击)
 * - mix-blend-mode: overlay
 * - opacity: 0.6
 *
 * @example
 * <NoiseOverlay /> // 默认 0.6 透明度
 * <NoiseOverlay opacity={0.4} /> // 自定义透明度
 * <NoiseOverlay zIndex={100} /> // 自定义层级
 */

interface NoiseOverlayProps {
  /** 透明度 (0-1) */
  opacity?: number
  /** 层级 */
  zIndex?: number
  /** 混合模式 */
  blendMode?: "overlay" | "multiply" | "screen" | "normal"
  /** 附加类名 */
  className?: string
}

export function NoiseOverlay({
  opacity = 0.6,
  zIndex = 9999,
  blendMode = "overlay",
  className,
}: NoiseOverlayProps) {
  // SVG 噪点纹理 - Base64 编码
  const noiseSvg = `data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E`

  return (
    <div
      className={cn(
        "fixed inset-0 pointer-events-none",
        className
      )}
      style={{
        backgroundImage: `url("${noiseSvg}")`,
        opacity,
        zIndex,
        mixBlendMode: blendMode,
      }}
      aria-hidden="true"
    />
  )
}

/**
 * GridPattern - 网格背景图案
 *
 * 复刻 HTML 中的 --grid-pattern 背景
 */
interface GridPatternProps {
  /** 网格点大小 */
  dotSize?: number
  /** 网格间距 */
  spacing?: number
  /** 透明度 */
  opacity?: number
  className?: string
}

export function GridPattern({
  dotSize = 1.5,
  spacing = 32,
  opacity = 1,
  className,
}: GridPatternProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 pointer-events-none -z-10",
        className
      )}
      style={{
        backgroundImage: `radial-gradient(rgb(var(--content-secondary)) ${dotSize}px, transparent ${dotSize}px)`,
        backgroundSize: `${spacing}px ${spacing}px`,
        opacity,
      }}
      aria-hidden="true"
    />
  )
}

// BauhausBackground 已删除，因为未被使用
// 如需使用，可以单独组合 GridPattern 和 NoiseOverlay
