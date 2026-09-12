/**
 * 产物类型 → 展示语义（颜色 / 图标 / 能力）单一真相源
 *
 * [背景] 产物类型 chip、卡片色块、详情弹框、任务控制页关联产物都按
 * "类型"取识别色与图标；能力位（可编辑/可导出 MD/下载扩展名）此前
 * 散落在画布与弹框两处且各自漂移，现收敛到本模块。
 *
 * 色值与 lib/expertIdentity 辅色系同源（雾蓝/鼠尾草/陶土…），
 * 组件里不要内联这些值。
 */

import {
  Code2, Database, BarChart3, Globe, FileJson, Search, Image, Film, Play, FileText, Braces,
} from 'lucide-react'

/** 类型 → 识别色（低饱和暖色系，与专家色板同族） */
export const ARTIFACT_TYPE_COLOR: Record<string, string> = {
  code: '#6f93ad', sql: '#6f93ad', json: '#7aa5b5', chart: '#7aa5b5',
  html: '#b45f55', markdown: '#7d9b76', report: '#7d9b76', search: '#8b7ec8',
  image: '#a8556f', video: '#7aa5b5', media: '#7aa5b5', text: '#6f6a62',
}

/** 类型 → 图标 */
export const ARTIFACT_TYPE_ICON: Record<string, React.ElementType> = {
  code: Code2, sql: Database, json: FileJson, chart: BarChart3,
  html: Globe, markdown: FileText, report: FileText, search: Search,
  image: Image, video: Film, media: Play, text: FileText,
}

/** 类型 → i18n 词条键（卡片/过滤器的本地化类型名；无映射时回退原始 type） */
export const ARTIFACT_TYPE_LABEL_KEY: Record<string, string> = {
  code: 'artifactTypeCode', sql: 'artifactTypeSql', json: 'artifactTypeJson',
  chart: 'artifactTypeChart', html: 'artifactTypeHtml', markdown: 'artifactTypeMarkdown',
  report: 'artifactTypeReport', search: 'artifactTypeSearch', image: 'artifactTypeImage',
  video: 'artifactTypeVideo', media: 'artifactTypeMedia', text: 'artifactTypeText',
}

/** 画廊过滤器的常用类型（冷门类型不加 chip，全部档仍可见） */
export const GALLERY_FILTER_TYPES = [
  'markdown', 'report', 'code', 'sql', 'json', 'html', 'chart', 'image',
] as const

export function artifactTypeColor(type: string): string {
  return ARTIFACT_TYPE_COLOR[type] || '#6f6a62'
}

export function artifactTypeIcon(type: string): React.ElementType {
  return ARTIFACT_TYPE_ICON[type] || Braces
}

/** 类型 chip 样式（低饱和底 + 深字） */
export function artifactTypeChipStyle(type: string): React.CSSProperties {
  const color = artifactTypeColor(type)
  return { backgroundColor: `${color}1f`, color }
}

/** 可在弹框内直接编辑的文本型产物 */
export const EDITABLE_ARTIFACT_TYPES = new Set(['markdown', 'text', 'code', 'html', 'report', 'sql', 'json'])

/** 类型 → 下载扩展名（code 类可用 language 细分） */
const TYPE_EXT: Record<string, string> = {
  markdown: 'md', code: 'txt', html: 'html', text: 'txt',
  sql: 'sql', json: 'json', chart: 'json', report: 'md',
}

/** 语言 → 扩展名（下载源文件时优先于类型兜底） */
const LANGUAGE_EXT: Record<string, string> = {
  python: 'py', javascript: 'js', typescript: 'ts', jsx: 'jsx', tsx: 'tsx',
  java: 'java', go: 'go', rust: 'rs', c: 'c', cpp: 'cpp', csharp: 'cs',
  bash: 'sh', shell: 'sh', yaml: 'yml', css: 'css', ruby: 'rb', php: 'php',
}

export function artifactFileExt(type: string, language?: string | null): string {
  if (language) {
    const langExt = LANGUAGE_EXT[language.toLowerCase()]
    if (langExt) return langExt
  }
  return TYPE_EXT[type] || 'txt'
}
