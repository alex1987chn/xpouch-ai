"use client"

import { motion } from "framer-motion"

interface The4DPocketLogoProps {
  className?: string
}

export function The4DPocketLogo({ className }: The4DPocketLogoProps) {
  // 底座回弹动画 (保持原样，微调节奏配合下落)
  const baseRecoilVariants = {
    animate: {
      scaleY: [1, 0.8, 1.05, 1, 1],
      scaleX: [1, 1.1, 0.95, 1, 1],
      transition: {
        duration: 3,
        repeat: Infinity,
        // 在 0.35 (下落结束时) 触发回弹
        times: [0, 0.35, 0.45, 0.55, 1],
        ease: "easeInOut" as const,
      },
    },
  }

  // 优化：下落动画 - 缩短周期，添加缩小消失效果
  const dropProcessVariants = {
    animate: {
      // 位置：从更高处开始，更快到达底部
      top: ["-35px", "-15px", "10px", "10px", "10px", "10px", "10px"],
      
      // 透明度：全程可见，最后缩小消失
      opacity: [0, 1, 1, 1, 1, 0.8, 0],
      
      rotate: [0, 0, 0, 8, -8, 0, 0],
      // 优化：最后阶段缩小消失，更自然
      scale: [1, 1, 1, 1, 1, 0.6, 0],
      
      // 颜色循环
      backgroundColor: [
        "var(--logo-item)", // Start
        "var(--logo-item)", 
        "var(--logo-item)", // Land
        "var(--logo-item-active)", // Activate
        "var(--logo-item-active)", 
        "var(--logo-item)", 
        "var(--logo-item)", 
      ],
      
      transition: {
        duration: 2.5, // 缩短周期：3s -> 2.5s
        repeat: Infinity,
        // 优化时间点
        times: [0, 0.08, 0.3, 0.45, 0.55, 0.85, 1],
        ease: "easeInOut" as const,
      },
    },
  }

  return (
    <div
      className={`relative w-[42px] h-[42px] ${className || ""}`}
      // 加上 overflow-visible 确保掉落前不会被裁剪（虽然 absolute 应该没事，但保险起见）
      style={{ willChange: "transform", overflow: "visible" }}
    >
      {/* 掉落的方块 (Pocket Item) */}
      <motion.div
        className="absolute left-[13px] w-4 h-4 border-2 border-[rgb(var(--border-default))] z-[5]"
        style={{
          // 增加默认背景色防止 CSS 变量未加载时不可见
          backgroundColor: "var(--logo-item, #facc15)", 
          willChange: "transform, opacity, top",
        }}
        variants={dropProcessVariants}
        animate="animate"
      />

      {/* 口袋底座 (Pocket Base) */}
      <motion.div
        className="absolute bottom-2 left-[3px] w-9 h-5 border-2 border-t-0 border-[rgb(var(--border-default))] z-10"
        style={{
          // 增加默认背景色
          backgroundColor: "var(--logo-base, #2563eb)",
          borderBottomLeftRadius: "18px",
          borderBottomRightRadius: "18px",
          transformOrigin: "bottom center",
          willChange: "transform",
        }}
        variants={baseRecoilVariants}
        animate="animate"
      />
    </div>
  )
}