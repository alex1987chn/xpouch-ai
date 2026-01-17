import { useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ZoomIn, ZoomOut, RefreshCw } from 'lucide-react'
import { useCanvasStore } from '@/store/canvasStore'
import ArtifactRenderer from './ArtifactRenderer.tsx'
import ParticleGrid from './ParticleGrid.tsx'

interface InteractiveCanvasProps {
  className?: string
  artifactType?: 'code' | 'mermaid' | 'markdown' | null
  artifactContent?: string
  isProcessing?: boolean // 是否正在处理任务（用于粒子动画）
}

export default function InteractiveCanvas({
  className,
  artifactType = null,
  artifactContent = '',
  isProcessing = false
}: InteractiveCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    scale,
    setScale,
    offsetX,
    offsetY,
    setOffset,
    resetView,
    isDragging,
    setIsDragging
  } = useCanvasStore()

  // Motion values for smooth animations
  const motionScale = useMotionValue(scale)
  const motionOffsetX = useMotionValue(offsetX)
  const motionOffsetY = useMotionValue(offsetY)

  useEffect(() => {
    motionScale.set(scale)
    motionOffsetX.set(offsetX)
    motionOffsetY.set(offsetY)
  }, [scale, offsetX, offsetY, motionScale, motionOffsetX, motionOffsetY])

  // Handle wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()

    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newScale = Math.min(Math.max(scale + delta, 0.25), 3)

    if (newScale !== scale && containerRef.current) {
      try {
        const rect = containerRef.current.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const scaleChange = newScale / scale
        const newOffsetX = mouseX - (mouseX - offsetX) * scaleChange
        const newOffsetY = mouseY - (mouseY - offsetY) * scaleChange

        setScale(newScale)
        setOffset(newOffsetX, newOffsetY)
      } catch (error) {
        console.warn('Failed to get container bounding rect:', error)
        // Fall back to simple scale change without offset adjustment
        setScale(newScale)
      }
    }
  }, [scale, offsetX, offsetY, setScale, setOffset])

  // Handle mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
    }
  }, [setIsDragging])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setOffset(offsetX + e.movementX, offsetY + e.movementY)
    }
  }, [isDragging, offsetX, offsetY, setOffset])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [setIsDragging])

  // Global mouse up listener
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false)
    document.addEventListener('mouseup', handleGlobalMouseUp)
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [setIsDragging])

  // Register wheel event
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false })
      return () => container.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  // Zoom controls
  const handleZoomIn = () => setScale(Math.min(scale + 0.25, 3))
  const handleZoomOut = () => setScale(Math.max(scale - 0.25, 0.25))
  const handleReset = () => resetView()

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-screen w-screen overflow-hidden',
        'bg-gray-100 dark:bg-gray-950',
        'bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))]',
        'bg-[length:40px_40px]',
        'bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)]',
        'dark:bg-[linear-gradient(to_right,#374151_1px,transparent_1px),linear-gradient(to_bottom,#374151_1px,transparent_1px)]',
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Dark Mode 粒子网格背景 - 仅在暗色模式下显示 */}
      <ParticleGrid isProcessing={isProcessing} className="absolute inset-0 dark:block hidden" />
      {/* Transform Container - Stage */}
      <motion.div
        className="absolute inset-0 origin-top-left overflow-hidden"
        style={{
          scale: motionScale,
          x: motionOffsetX,
          y: motionOffsetY
        }}
      >
        {/* Artifact Renderer - Center Stage */}
        <div className="w-full h-full flex items-center justify-center p-8">
          <AnimatePresence mode="wait">
            {artifactType ? (
              <motion.div
                key="artifact"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full"
              >
                <ArtifactRenderer
                  type={artifactType}
                  content={artifactContent}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 w-full h-full overflow-hidden"
              >
                <div className="text-center max-w-md space-y-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center">
                    <svg
                      className="w-10 h-10 text-indigo-600 dark:text-indigo-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-700 dark:text-gray-200">
                    等待 AI 生成内容
                  </h3>
                  <p className="text-sm">
                    在右侧对话框中描述任务，AI 将在此区域生成代码、图表或文档
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Zoom Controls */}
      <div className="absolute bottom-6 left-6 flex items-center gap-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-1"
        >
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="w-14 text-center text-sm font-medium">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <button
            onClick={handleReset}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="重置视图"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </div>
  )
}
