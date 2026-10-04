/**
 * 计划任务行的「产出类型」小标判定。
 *
 * 数据面没有结构化的产出类型字段——commander 被教材要求把产出要求写进
 * 任务 description（"产出 markdown 格式的报告"/"产出 code 类型"），这里
 * 从 description 嗅探展示用标签。纯展示层启发式：判不出就不显示 chip，
 * 绝不影响路由或执行。
 */

export type PlanTaskOutputKind = 'html' | 'code' | 'doc'

const PATTERNS: Array<[PlanTaskOutputKind, RegExp]> = [
  ['html', /html|可视化|网页|交互式/i],
  ['code', /代码|code\b|脚本|script|程序/i],
  ['doc', /报告|文档|markdown|方案|文案|总结|分析/i],
]

/** 从任务描述嗅探产出类型；判不出返回 null（不渲染 chip）。 */
export function planTaskOutputKind(description: string | undefined | null): PlanTaskOutputKind | null {
  if (!description) return null
  for (const [kind, pattern] of PATTERNS) {
    if (pattern.test(description)) return kind
  }
  return null
}

/** 工具名 → 活动序列显示名。仅本地化自家伪工具；第三方工具名是标识符，原样透出。 */
export function toolDisplayName(
  name: string | undefined | null,
  fallback: (key: 'toolSearchLabel') => string
): string {
  if (!name) return ''
  if (name === 'search_tools') return fallback('toolSearchLabel')
  return name
}

/** 产出类型 → 词条 key（模块级映射，字面量类型自明）。 */
export const OUTPUT_LABEL_KEY: Record<
  PlanTaskOutputKind,
  'planOutput_html' | 'planOutput_code' | 'planOutput_doc'
> = {
  html: 'planOutput_html',
  code: 'planOutput_code',
  doc: 'planOutput_doc',
}
