import { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { SWIPE } from '@/constants/ui'

interface UseSwipeBackProps {
  targetPath?: string // 如果不提供，则使用 navigate(-1) 返回上一页
  onSwipe?: () => void // 自定义回调函数，优先级高于 targetPath
  enabled?: boolean // 默认启用
}

/**
 * 移动端右滑返回 Hook
 * 从屏幕左边缘向右滑动触发返回
 */
export function useSwipeBack({ targetPath, onSwipe, enabled = true }: UseSwipeBackProps = {}) {
  const navigate = useNavigate()
  const touchStartXRef = useRef(0)
  const [swipeProgress, setSwipeProgress] = useState(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
    // 只在边缘区域内响应滑动
    const touchX = e.touches[0].clientX
    if (touchX < SWIPE.EDGE_ZONE) {
      touchStartXRef.current = touchX
    } else {
      touchStartXRef.current = 0
    }
  }, [enabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || touchStartXRef.current <= 0) return
    const currentX = e.touches[0].clientX
    const diff = currentX - touchStartXRef.current
    // 限制最大滑动距离
    if (diff > 0 && diff < SWIPE.MAX_DISTANCE) {
      setSwipeProgress(diff)
    }
  }, [enabled])

  const handleTouchEnd = useCallback(() => {
    if (enabled && swipeProgress > SWIPE.THRESHOLD) {
      // 触发返回，优先使用自定义回调
      if (onSwipe) {
        onSwipe()
      } else if (targetPath) {
        navigate(targetPath)
      } else {
        navigate(-1)
      }
    }
    setSwipeProgress(0)
    touchStartXRef.current = 0
  }, [enabled, swipeProgress, navigate, targetPath, onSwipe])

  return {
    swipeProgress,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  }
}
