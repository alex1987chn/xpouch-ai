/**
 * 聊天组件通用工具函数
 */

/**
 * 提取消息中的代码块
 * 返回代码块数组，每个包含语言和代码内容
 */
export function extractCodeBlocks(content: string): Array<{language: string, code: string}> {
  // 🔥 修复：处理空值
  if (!content) return []
  
  const codeBlocks: Array<{language: string, code: string}> = []
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text'
    const code = match[2].trim()
    if (code) {
      codeBlocks.push({ language, code })
    }
  }

  return codeBlocks
}

/**
 * 内容类型检测结果
 * 
 * 3 Core Types 架构：
 * - code: 所有逻辑类内容（python/js/mermaid/json-chart等），通过 language 字段区分具体类型
 * - markdown: Markdown 文档
 * - html: HTML 内容
 */
export interface ContentTypeResult {
  type: 'code' | 'markdown' | 'html'
  content: string
  language?: string  // 仅当 type='code' 时使用，标识具体语言（如 'python', 'mermaid', 'json-chart'）
}

/**
 * 可视化内容优先级（用于多代码块场景）
 * 优先级越高越值得被优先预览
 */
const VISUAL_PRIORITY = ['html', 'htm', 'mermaid', 'json-chart']

/**
 * 判断内容类型
 * 
 * 3 Core Types 架构检测逻辑：
 * 1. HTML → 独立类型，走 HtmlArtifact
 * 2. Markdown/MD → 直接渲染为 Markdown
 * 3. 其他所有（python/js/ts/mermaid/json-chart等）→ code 类型，保留 language 字段
 * 
 * 🔥 多代码块优先级策略：
 * 当 LLM 返回多个代码块时（如 Python + Mermaid），优先展示可视化内容（Mermaid/Chart/HTML）
 * 因为这些比普通代码更值得"预览"
 * 
 * CodeArtifact 作为智能中枢，会根据 language 字段分发到不同渲染器
 */
export function detectContentType(
  codeBlocks: Array<{language: string, code: string}>,
  fullContent: string
): ContentTypeResult | null {
  // 🔥 修复：处理空值
  if (!fullContent) return null
  
  // 优先处理代码块
  if (codeBlocks.length > 0) {
    // 👑 优先级策略：先找有没有图表/流程图/HTML，因为它们比普通代码更值得"预览"
    const visualBlock = codeBlocks.find(b => 
      VISUAL_PRIORITY.includes(b.language.toLowerCase())
    )

    // 如果找到了可视化块，优先用它生成 Artifact
    if (visualBlock) {
      const lang = visualBlock.language.toLowerCase()
      
      // HTML 独立处理
      if (lang === 'html' || lang === 'htm') {
        return { type: 'html', content: visualBlock.code }
      }
      
      // Mermaid 和 json-chart 归为 code 类型，但保留 language 用于智能分发
      return { 
        type: 'code', 
        content: visualBlock.code,
        language: lang  // 👈 'mermaid' 或 'json-chart'
      }
    }

    // 没找到可视化的，降级使用第一个代码块
    const firstBlock = codeBlocks[0]
    const lang = firstBlock.language.toLowerCase()

    // 1. HTML 独立处理
    if (lang === 'html' || lang === 'htm') {
      return { type: 'html', content: firstBlock.code }
    }
    
    // 2. Markdown 直接渲染
    if (['markdown', 'md'].includes(lang)) {
      return { type: 'markdown', content: firstBlock.code }
    }
    
    // 3. 其他所有（python/js/ts等）都归为 code 类型
    return { 
      type: 'code', 
      content: firstBlock.code,
      language: lang  // 👈 透传 'python', 'javascript' 等
    }
  }

  // 没有代码块时，检查是否是 Markdown 格式内容
  if (fullContent.length > 50) {
    // 检测 Markdown 特征：标题、列表、粗体、斜体、链接等
    const markdownPatterns = [
      /^#{1,6}\s+/m,           // 标题 # ## ###
      /^\s*[-*+]\s+/m,        // 列表 - * +
      /^\s*\d+\.\s+/m,        // 有序列表 1. 2.
      /\*\*[^*]+\*\*/,        // 粗体 **text**
      /\*[^*]+\*/,            // 斜体 *text*
      /\[[^\]]+\]\([^)]+\)/,  // 链接 [text](url)
      /^\s*```/m,             // 代码块 ```
      /^\s*>\s+/m,            // 引用 >
      /\|[^|]+\|/,            // 表格 |
    ]

    const markdownScore = markdownPatterns.reduce((score, pattern) => {
      return score + (pattern.test(fullContent) ? 1 : 0)
    }, 0)

    // 如果匹配至少 2 个 Markdown 特征，认为是 Markdown 内容
    if (markdownScore >= 2) {
      return { type: 'markdown', content: fullContent }
    }
  }

  return null
}

/**
 * 检测内容中的媒体链接
 * 返回检测到的媒体类型和 URL
 */
export function detectMediaUrl(content: string): { type: 'image' | 'video' | null; url: string | null } {
  if (!content) return { type: null, url: null }
  
  // 匹配 Markdown 链接中的 URL [text](url)
  const markdownMatch = content.match(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/)
  if (markdownMatch) {
    const url = markdownMatch[2]
    const lowerUrl = url.toLowerCase()
    
    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(lowerUrl)) {
      return { type: 'image', url }
    }
    if (/\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(lowerUrl)) {
      return { type: 'video', url }
    }
  }
  
  // 匹配纯 URL
  const urlMatch = content.match(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/i)
  if (urlMatch) {
    const url = urlMatch[1]
    const lowerUrl = url.toLowerCase()
    
    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(lowerUrl)) {
      return { type: 'image', url }
    }
    if (/\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(lowerUrl)) {
      return { type: 'video', url }
    }
  }
  
  return { type: null, url: null }
}

/**
 * 专家显示名不在这里：旧 translateExpertName 已删（死代码 + 词条分散在两处），
 * 唯一真相源是 lib/expertIdentity 的 EXPERT_TYPE_LABEL_KEY / expertLabel。
 */
