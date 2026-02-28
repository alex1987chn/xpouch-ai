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

  // 核心修复：下落动画
  const dropProcessVariants = {
    animate: {
      // 1. 位置：从更高(-35px)开始，0.35才到底部(10px)
      top: ["-35px", "-10px", "10px", "10px", "10px", "10px", "10px"],
      
      // 2. 透明度：0.1的时候就完全显示了，这样能看到空中的轨迹
      opacity: [0, 1, 1, 1, 1, 1, 0],
      
      rotate: [0, 0, 0, 10, -10, 0, 0],
      scale: [1, 1, 1, 1, 1, 1, 0],
      
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
        duration: 3,
        repeat: Infinity,
        // 关键时间点调整：
        // 0 -> 0.1: 快速现身
        // 0 -> 0.35: 下落过程 (给足够的时间让人眼捕捉)
        // 0.35: 接触底部
        times: [0, 0.1, 0.35, 0.5, 0.6, 0.8, 1],
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