"use client"

import { motion } from "framer-motion"

interface The4DPocketLogoProps {
  className?: string
}

export function The4DPocketLogo({ className }: The4DPocketLogoProps) {
  // baseRecoil animation: scaleY/scaleX keyframes
  const baseRecoilVariants = {
    animate: {
      scaleY: [1, 0.8, 1.05, 1, 1],
      scaleX: [1, 1.1, 0.95, 1, 1],
      transition: {
        duration: 3,
        repeat: Infinity,
        times: [0, 0.35, 0.4, 0.5, 0.6, 1],
        ease: [0.25, 1, 0.5, 1],
      },
    },
  }

  // dropProcess animation: top/opacity/rotate/scale keyframes
  const dropProcessVariants = {
    animate: {
      top: ["-20px", "10px", "10px", "10px", "10px", "10px", "10px"],
      opacity: [0, 1, 1, 1, 1, 1, 0],
      rotate: [0, 0, 10, -10, 0, 0, 0],
      scale: [1, 1, 1, 1, 1, 1, 0],
      backgroundColor: [
        "var(--logo-item)",
        "var(--logo-item)",
        "var(--logo-item-active)",
        "var(--logo-item-active)",
        "var(--logo-item)",
        "var(--logo-item)",
        "var(--logo-item)",
      ],
      transition: {
        duration: 3,
        repeat: Infinity,
        times: [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1],
        ease: [0.68, -0.55, 0.27, 1.55],
      },
    },
  }

  return (
    <div
      className={`relative w-[42px] h-[42px] ${className || ""}`}
      style={{ willChange: "transform" }}
    >
      {/* Pocket Item - Animated drop */}
      <motion.div
        className="absolute left-[13px] w-4 h-4 border-2 border-[var(--border-color)] z-[5]"
        style={{
          backgroundColor: "var(--logo-item)",
          willChange: "transform, opacity",
        }}
        variants={dropProcessVariants as any}
        animate="animate"
      />

      {/* Pocket Base - Animated recoil */}
      <motion.div
        className="absolute bottom-2 left-[3px] w-9 h-5 border-2 border-t-0 border-[var(--border-color)] z-10"
        style={{
          backgroundColor: "var(--logo-base)",
          borderBottomLeftRadius: "18px",
          borderBottomRightRadius: "18px",
          transformOrigin: "bottom center",
          willChange: "transform",
        }}
        variants={baseRecoilVariants as any}
        animate="animate"
      />
    </div>
  )
}
