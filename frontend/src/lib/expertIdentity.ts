/**
 * 专家识别色系统（阶段 3 种子）
 *
 * [设计] 每位专家从受控低饱和色板上确定性取色（按 expert_type 哈希），
 * 同一专家在任何界面颜色一致——会话地层/任务步骤/产物归属/资源库贯穿。
 * 这是寻路语义（"这步是谁干的"），不是装饰色。
 *
 * [约束] 色板为跨主题常量（身份色不随明暗主题漂移，如同品牌色）；
 * 值取自暖气候低饱和系，与 docs/design/ 蓝本的专家色一致。
 */

import { getSystemAgentName } from '@/constants/agents'

/** 受控识别色板（雾蓝/鼠尾草/陶土/雾紫/青灰/驼棕） */
const EXPERT_PALETTE = [
  '#6f93ad', // 雾蓝
  '#7d9b76', // 鼠尾草
  '#b45f55', // 陶土
  '#8b7ec8', // 雾紫
  '#7aa5b5', // 青灰
  '#a5876b', // 驼棕
] as const

/** FNV-1a 字符串哈希（短小、分布均匀、无依赖） */
function hashString(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 专家识别色（十六进制），同 key 永远同色 */
export function expertColor(expertType: string): string {
  return EXPERT_PALETTE[hashString(expertType) % EXPERT_PALETTE.length]
}

/** 识别色圆点样式（inline style，避免动态类名 JIT 失效） */
export function expertDotStyle(expertType: string): React.CSSProperties {
  return { backgroundColor: expertColor(expertType) }
}

/**
 * 专家显示名：内置专家走系统映射，自定义专家返回 key。
 * 调用方若持有专家列表（useAgentsQuery），优先用列表里的 name 再兜底到这里。
 */
export function expertDisplayName(expertType: string): string {
  return getSystemAgentName(expertType) || expertType
}
