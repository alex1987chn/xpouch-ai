/**
 * 幽灵类名扫描器 v2（真值 = 构建产物 CSS）
 *
 * 原理：Tailwind 编译后的 dist/assets/index-*.css 包含全部实际生成的类。
 * 对比：源码（tsx/ts）中出现的类 token vs CSS 类选择器集合 →
 *   源码里有、CSS 里没有 = 幽灵类（不会产生任何样式）。
 *
 * 规则：
 * - 只统计 tsx（跳过 .ts 工具/测试/类型文件，降低噪声）
 * - 变体前缀（hover:/md:/group-hover: 等）取末段校验
 * - 任意值 [..] 放行（JIT 保证生成）
 * - 白名单：第三方/运行时类（不经过 Tailwind 生成）
 *
 * 用法：先 npm run build，再 node tools/scan-ghost-classes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const DIST = path.join(ROOT, 'dist', 'assets')

// ---------- 1. 从构建 CSS 提取全部生成的类 ----------
const cssFiles = fs.readdirSync(DIST).filter(f => f.endsWith('.css'))
const cssClasses = new Set()
const UNESCAPE = s => s.replace(/\\/g, '')
for (const f of cssFiles) {
  const css = fs.readFileSync(path.join(DIST, f), 'utf8')
  // 类选择器：.name（可含转义 : / [ ] % . 等），排除 @规则 与声明
  const re = /\.((?:[a-zA-Z0-9_-]|\\[:\[\]\/\(\)\.##%])+)/g
  let m
  while ((m = re.exec(css))) {
    cssClasses.add(UNESCAPE(m[1]))
  }
}
console.log(`CSS 类集合：${cssClasses.size} 个（来自 ${cssFiles.length} 个文件）`)

// ---------- 2. 收集源码用到的类 ----------
const files = []
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full)
    else if (/\.tsx$/.test(f)) files.push(full)
  }
}
walk(SRC)

const VARIANT_PREFIX = /^(?:[a-z]{2,14}(?:-light)?|-?translate-x|-translate-y|group-hover|peer|peer-checked|peer-disabled|first|last|odd|even|hover|focus|focus-visible|focus-within|active|disabled|md|sm|lg|xl|2xl|max-lg|max-md|dark|placeholder|before|after|selection|marker|file|first-line|first-letter|supports|has|aria|data-\[[^\]]+\]|motion-safe|motion-reduce|container):/

const WHITELIST = new Set([
  // 运行时/第三方（不经 Tailwind 生成）
  'stagger-item', 'user-message', 'ai-message', 'animate-in', 'fade-in', 'fade-out',
  'zoom-in-95', 'zoom-out-95', 'slide-in-from-top-2', 'slide-in-from-bottom-2',
  'slide-in-from-left', 'slide-in-from-right', 'slide-out-to-right',
  'dot-grid', 'bg-noise', 'bauhaus-scrollbar', 'ascii-title', 'ascii-box', 'ascii-line',
  'btn-bauhaus', 'card-bauhaus', 'marquee-track', 'marquee-paused', 'status-marquee',
  'text-bauhaus', 'border-bauhaus', 'shadow-bauhaus', 'btn-3d', 'panel-3d', 'logo-3d',
  'glitch-text', 'terminal-cursor', 'cyan-glow', 'hover-glow', 'industrial-input',
  'industrial-label', 'industrial-panel', 'badge-industrial', 'table-industrial',
  'prose', 'katex', 'hljs',
])

const usedByFile = new Map()
let totalUsed = 0
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const set = new Set()
  // 所有引号/模板串里的空白分隔 token
  const re = /["'`]([^"'`\n]{2,400})["'`]/g
  let m
  while ((m = re.exec(src))) {
    for (const raw of m[1].split(/\s+/)) {
      let tok = raw
      // 剥离非类字符尾巴（模板 ${} 前后、标点）
      tok = tok.replace(/[},(]/g, '')
      if (!tok || tok.length < 2 || tok.length > 80) continue
      if (!/^[a-zA-Z0-9_:[\]\/\-.%#]+$/.test(tok)) continue
      if (tok.startsWith('.') || tok.startsWith('/') || tok.includes('//')) continue
      if (tok.includes('://') || tok.includes('@/') || tok.includes('@')) continue
      totalUsed++
      set.add(tok)
    }
  }
  if (set.size) usedByFile.set(file, set)
}

// ---------- 3. 比对 ----------
const ghost = new Map()
const byClass = new Map()
let total = 0
for (const [file, set] of usedByFile) {
  // Tailwind 语法特征前缀（属性类才会是幽灵候选；其他引号串是文案/键名）
  const TW_RE = /^(?:text-|bg-|border|rounded|shadow-|font-|w-|h-|min-w-|max-w-|min-h-|max-h-|p[tblrxy]?-|m[tblrxy]?-|gap-|space-[xy]-|items-|justify-|opacity-|animate-|transition-|duration-|tracking-|leading-|z-|top-|bottom-|left-|right-|inset-|flex|grid|grid-cols-|col-span-|row-span-|overflow-|object-|whitespace-|break-|truncate|list-|divide-|ring-|outline-|blur-|scale-|translate-|rotate-|skew-|underline|decoration-|placeholder-|group-|peer-|container|aspect-|columns-|basis-|grow-|shrink-|order-|self-|place-|content-|align-|backdrop-|from-|via-|to-|divide)/
  const hits = []
  for (const tok of set) {
    const bare = tok.split(':').pop()
    if (!TW_RE.test(bare)) continue
    if (cssClasses.has(bare) || cssClasses.has(tok)) continue
    if (bare.startsWith('-') && cssClasses.has(bare.slice(1))) continue
    if (/\[[^\]]+\]$/.test(bare) && !bare.startsWith('/')) continue // 任意值放行
    if (WHITELIST.has(bare) || WHITELIST.has(tok)) continue
    hits.push(tok)
    byClass.set(bare, (byClass.get(bare) ?? 0) + 1)
  }
  if (hits.length) {
    ghost.set(file, hits)
    total += hits.length
  }
}

// 自定义语义 token 真值校验（colors 等，从 tailwind.config.ts 抽键并验证 CSS）
const tsText = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8')
const semanticExpected = []
const colorGroups = {}
const colorsIdx = tsText.indexOf('colors:')
const colorsOpen = tsText.indexOf('{', colorsIdx)
let depth = 0, colorsEnd = colorsOpen
for (let i = colorsOpen; i < tsText.length; i++) {
  if (tsText[i] === '{') depth++
  else if (tsText[i] === '}') { depth--; if (depth === 0) { colorsEnd = i; break } }
}
const colorsBlock = tsText.slice(colorsOpen, colorsEnd + 1)
const colorRe = /([a-z]+)\s*:\s*\{/g
const keyRe = new RegExp("(?:^|[\\n{,])\\s*'?([A-Za-z0-9_-]+)'?\\s*:", 'g')
let gm
while ((gm = colorRe.exec(colorsBlock))) {
  const open = colorsBlock.indexOf('{', gm.index)
  let d = 0, end = open
  for (let i = open; i < colorsBlock.length; i++) {
    if (colorsBlock[i] === '{') d++
    else if (colorsBlock[i] === '}') { d--; if (d === 0) { end = i; break } }
  }
  const body = colorsBlock.slice(open + 1, end)
  const keys = []
  let k
  while ((k = keyRe.exec(body))) if (k[1] !== 'DEFAULT') keys.push(k[1])
  keyRe.lastIndex = 0
  colorGroups[gm[1]] = keys
}
for (const [group, keys] of Object.entries(colorGroups)) {
  for (const key of keys) {
    const cls = `${group}-${key}`
    // 检查 text-*/bg-*/border-*/ring-*/from-* 至少一种用法在 CSS 中存在
    const any =
      cssClasses.has(cls) ||
      [...cssClasses].some(c => c.endsWith(cls))
    if (!any) semanticExpected.push(cls)
  }
}
if (semanticExpected.length) {
  console.log('\n⚠ 语义 token 未被任何类使用（配置冗余，不是错误）:')
  for (const s of semanticExpected) console.log('   ', s)
}

console.log(`\n==== 幽灵类总计 ${total} 处（源码用到但未生成样式），涉及 ${ghost.size} 文件 ====`)
for (const [file, list] of [...ghost.entries()].sort()) {
  console.log('\n' + path.relative(ROOT, file))
  console.log('   ', [...new Set(list)].join('  '))
}
const top = [...byClass.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
console.log('\nTop20:', top.map(([c, n]) => `${c}(${n})`).join('  '))
