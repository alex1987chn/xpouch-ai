/**
 * 弹窗 Escape 关闭
 *
 * 手搓 Portal 弹窗的统一 Escape 处理：isOpen 为 true 时监听 keydown，
 * 按 Esc 触发 onClose。与 Radix Dialog 的原生行为对齐。
 *
 * 使用方式：
 * useEscapeToClose(isOpen, handleClose)
 */
import { useEffect } from 'react'

export function useEscapeToClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])
}
