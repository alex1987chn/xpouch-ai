/**
 * 主题切换过渡（A+B 方案，用户拍板）
 *
 * B · View Transitions 光圈扩散：以切换按钮为圆心，新主题像灯一样
 *     圆形点亮/熄灭铺满全屏（Chromium/Safari 18+）。
 * A · 全局色彩渐变兜底：挂 theme-transitioning 类让全站颜色属性统一
 *     缓动 550ms，动画结束摘掉（避免常驻全局过渡拖累性能）。
 * 两档都尊重 prefers-reduced-motion（开启即瞬切）。
 */

type ViewTransitionLike = { ready: Promise<void> }
type DocumentWithVT = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransitionLike
}

export interface TransitionOrigin {
  x: number
  y: number
}

export function applyThemeWithTransition(apply: () => void, origin?: TransitionOrigin): void {
  if (typeof window === 'undefined') {
    apply()
    return
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    apply()
    return
  }

  const doc = document as DocumentWithVT
  if (typeof doc.startViewTransition === 'function') {
    const { x, y, radius } = resolveOrigin(origin)
    const transition = doc.startViewTransition(apply)
    void transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 550,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          }
        )
      })
      .catch(() => {
        /* ready 被跳过（如连续快速切换）——主题已在回调内生效 */
      })
    return
  }

  // A 兜底：全局色彩渐变
  document.documentElement.classList.add('theme-transitioning')
  apply()
  window.setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning')
  }, 600)
}

function resolveOrigin(origin?: TransitionOrigin): { x: number; y: number; radius: number } {
  const w = window.innerWidth
  const h = window.innerHeight
  const x = origin?.x ?? w / 2
  const y = origin?.y ?? h / 2
  // 半径取"到最远角"的距离，保证圆铺满全屏
  const radius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y))
  return { x, y, radius }
}
