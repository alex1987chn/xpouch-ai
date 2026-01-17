import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Particle {
  id: number
  x: number
  y: number
  delay: number
  initialOpacity: number
  targetOpacity: number
}

interface ParticleGridProps {
  isProcessing?: boolean // 是否正在处理任务
  className?: string
}

export default function ParticleGrid({ isProcessing = false, className = '' }: ParticleGridProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const [centerX, setCenterX] = useState(0)
  const [centerY, setCenterY] = useState(0)
  
  // 记录中心位置
  useEffect(() => {
    if (!containerRef.current) return
    
    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    
    setCenterX(rect.width / 2)
    setCenterY(rect.height / 2)
    
    // 生成粒子网格 - 稀疏分布，模仿点阵风格
    const newParticles: Particle[] = []
    const spacing = 40 // 粒子间距
    
    for (let x = 0; x < rect.width; x += spacing) {
      for (let y = 0; y < rect.height; y += spacing) {
        newParticles.push({
          id: newParticles.length,
          x,
          y,
          delay: Math.random() * 2, // 随机延迟，创造呼吸感
          initialOpacity: 0.05 + Math.random() * 0.1, // 初始透明度：非常微弱
          targetOpacity: 0.15 + Math.random() * 0.1 // 目标透明度
        })
      }
    }
    
    setParticles(newParticles)
  }, [])
  
  return (
    <div ref={containerRef} className={className}>
      {/* 粒子网格 */}
      <AnimatePresence mode="sync">
        {particles.map((particle) => {
          // 计算到中心的距离和汇聚动画
          const isConverging = isProcessing
          const distanceToCenter = isConverging 
            ? Math.sqrt(
                Math.pow(particle.x - centerX, 2) +
                Math.pow(particle.y - centerY, 2)
              )
            : 0
          
          const convergeScale = isConverging
            ? Math.max(1 - distanceToCenter / 800, 0.4) // 靠近中心时粒子变小
            : 1
          
          const convergeOpacity = isConverging
            ? 0.35 + (1 - Math.min(distanceToCenter / 600, 1)) * 0.4 // 靠近中心时更亮
            : particle.targetOpacity
          
          return (
            <motion.div
              key={particle.id}
              initial={{ 
                opacity: 0,
                scale: 0
              }}
              animate={{
                opacity: isConverging ? convergeOpacity : particle.targetOpacity,
                scale: isConverging ? convergeScale : 1,
                x: isConverging 
                  ? (centerX - particle.x) * 0.15
                  : 0,
                y: isConverging
                  ? (centerY - particle.y) * 0.15
                  : 0
              }}
              transition={{
                opacity: {
                  duration: 0.8,
                  delay: particle.delay,
                  ease: "easeInOut"
                },
                scale: {
                  duration: isConverging ? 2 : 0.8,
                  delay: particle.delay,
                  ease: isConverging ? "easeInOut" : "easeInOut"
                },
                x: {
                  duration: 2,
                  ease: "easeInOut"
                },
                y: {
                  duration: 2,
                  ease: "easeInOut"
                }
              }}
              className="absolute rounded-full"
              style={{
                left: particle.x,
                top: particle.y,
                width: '3px',
                height: '3px',
                background: 'rgba(99, 102, 241, 0.4)' // indigo-600 with low opacity
              }}
            />
          )
        })}
      </AnimatePresence>
      
      {/* 处理时的中心光晕效果 */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1.2 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
          >
            <div
              style={{
                width: '200px',
                height: '200px',
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%)'
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

