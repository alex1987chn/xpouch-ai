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
import type { TranslationKey } from '@/i18n'

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

/** 默认系统助手的 ID（含历史遗留别名）；它们不占专家识别色 */
const DEFAULT_AGENT_IDS = new Set(['sys-default-chat', 'assistant'])

/**
 * 智能体点色：默认助手返回 null（调用方渲染中性点）。
 * 哈希色对默认助手是"假身份色"——大多数会话都是默认助手，
 * 一律套随机识别色会让小圆看起来像无意义的装饰。
 */
export function agentDotStyle(agentId: string | null | undefined): React.CSSProperties | null {
  if (!agentId || DEFAULT_AGENT_IDS.has(agentId)) return null
  return expertDotStyle(agentId)
}

/**
 * 专家显示名：内置专家走系统映射，自定义专家返回 key。
 * 调用方若持有专家列表（useAgentsQuery），优先用列表里的 name 再兜底到这里。
 */
export function expertDisplayName(expertType: string): string {
  return getSystemAgentName(expertType) || expertType
}

/**
 * 系统专家类型 → i18n 词条。**显示名的唯一真相源**（2026-09-13 收敛）。
 *
 * 此前这个映射散在三处：`components/chat/utils.ts` 的 `translateExpertName`
 * （写好却无人调用，已删）、chat.ts 与 home.ts 各写了一半词条、以及界面直接渲染
 * `expert_type` 原串（审批弹窗上就显示成「search 执行」）。新增系统专家只改这里
 * + 对应词条即可；自定义专家不在表内，按 key 原样显示（有专家列表时优先用列表里的
 * name，见 expertDisplayName 的约定）。
 */
export const EXPERT_TYPE_LABEL_KEY: Record<string, TranslationKey> = {
  search: 'searchExpert',
  coder: 'codingExpert',
  researcher: 'researchExpert',
  analyzer: 'analyzerExpert',
  writer: 'writingExpert',
  planner: 'planningExpert',
  image_analyzer: 'imageAnalyzerExpert',
  memorize_expert: 'memoryExpert',
  designer: 'designerExpert',
  architect: 'architectExpert',
  // 编排链上的系统角色（任务的 expert_type 真会落到它们身上，例如计划最后一步）
  aggregator: 'aggregatorExpert',
  commander: 'commanderExpert',
  router: 'routerExpert',
}

/**
 * 专家显示名（带翻译）：表内走词条，表外（自定义专家）原样返回 key 串。
 *
 * @param t I18nProvider 的 t；纯函数不引 i18n 运行时，便于测试与复用
 */
export function expertLabel(expertType: string, t: (key: TranslationKey) => string): string {
  const key = EXPERT_TYPE_LABEL_KEY[expertType]
  return key ? t(key) : expertType
}
