import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

/**
 * The4DPocketLogo - 4D口袋Logo动画组件
 * 
 * 复刻 xpouch_ultra_refined.html 中的 Logo 动画：
 * - pocket-base: 底部半圆形容器，有 baseRecoil 动画
 * - pocket-item: 顶部下落的方块，有 dropProcess 动画
 * 
 * 使用 Framer Motion 重写，获得更好的性能和更流畅的动画
 * 
 * @example
 * <The4DPocketLogo size={42} />
 * <The4DPocketLogo size={64} className="mx-auto" />
 */

interface The4DPocketLogoProps {
  size?: number
  className?: string
}

export function The4DPocketLogo({ size = 42, className }: The4DPocketLogoProps) {
  // 根据尺寸计算各元素大小
  const scale = size / 42
  const baseWidth = 36 * scale
  const baseHeight = 20 * scale
  const itemSize = 16 * scale
  const borderWidth = 2 * scale

  return (
    <div 
      className={cn("relative", className)}
      style={{ width: size, height: size }}
    >
      {/* Pocket Base - 底部半圆形容器 */}
      <motion.div
        className="absolute z-10"
        style={{
          width: baseWidth,
          height: baseHeight,
          bottom: 8 * scale,
          left: 3 * scale,
          backgroundColor: "var(--logo-base)",
          border: `${borderWidth}px solid var(--border-color)`,
          borderTop: "none",
          borderBottomLeftRadius: baseHeight / 2,
          borderBottomRightRadius: baseHeight / 2,
        }}
        animate={{
          scaleY: [1, 0.8, 1.05, 1],
          scaleX: [1, 1.1, 0.95, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          times: [0, 0.4, 0.5, 0.6, 1],
          ease: [0.25, 1, 0.5, 1], // cubic-bezier(0.25, 1, 0.5, 1)
        }}
      />

      {/* Pocket Item - 顶部下落的方块 */}
      <motion.div
        className="absolute z-5"
        style={{
          width: itemSize,
          height: itemSize,
          left: (size - itemSize) / 2,
          backgroundColor: "var(--logo-item)",
          border: `${borderWidth}px solid var(--border-color)`,
        }}
        initial={{ top: -20 * scale, opacity: 0 }}
        animate={{
          top: [ -20 * scale, 10 * scale, 10 * scale, 10 * scale, 10 * scale ],
          opacity: [0, 1, 1, 1, 0],
          rotate: [0, 0, 10, -10, 0],
          scale: [1, 1, 1, 1, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          times: [0, 0.2, 0.5, 0.6, 0.8, 1],
          ease: [0.68, -0.55, 0.27, 1.55], // cubic-bezier(0.68, -0.55, 0.27, 1.55)
        }}
      />
    </div>
  )
}

/**
 * The4DPocketLogoCSS - 纯 CSS 版本（备用）
 * 
 * 如果不需要 framer-motion，可以使用这个版本
 */
export function The4DPocketLogoCSS({ size = 42, className }: The4DPocketLogoProps) {
  const scale = size / 42

  return (
    <div 
      className={cn("relative logo-wrapper", className)}
      style={{ 
        width: size, 
        height: size,
        ["--scale" as string]: scale,
      }}
    >
      {/* Pocket Item - 先渲染，在 base 下面 */}
      <div 
        className="absolute pocket-item"
        style={{
          width: 16 * scale,
          height: 16 * scale,
          left: 13 * scale,
          borderWidth: 2 * scale,
        }}
      />
      
      {/* Pocket Base */}
      <div 
        className="absolute pocket-base"
        style={{
          width: 36 * scale,
          height: 20 * scale,
          bottom: 8 * scale,
          left: 3 * scale,
          borderWidth: 2 * scale,
          borderBottomLeftRadius: 18 * scale,
          borderBottomRightRadius: 18 * scale,
        }}
      />
    </div>
  )
}
