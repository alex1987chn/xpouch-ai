/**
 * 聊天组件通用工具函数
 */

/**
 * 提取消息中的代码块
 * 返回代码块数组，每个包含语言和代码内容
 */
export function extractCodeBlocks(content: string): Array<{language: string, code: string}> {
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
 */
export interface ContentTypeResult {
  type: 'code' | 'markdown' | 'html'
  content: string
}

/**
 * 判断内容类型
 * 根据代码块语言或内容特征返回 artifact 类型
 */
export function detectContentType(
  codeBlocks: Array<{language: string, code: string}>,
  fullContent: string
): ContentTypeResult | null {
  // 优先处理代码块
  if (codeBlocks.length > 0) {
    // 如果只有一个代码块，直接用它
    if (codeBlocks.length === 1) {
      const block = codeBlocks[0]
      const lang = block.language.toLowerCase()

      if (lang === 'html' || lang === 'htm') {
        return { type: 'html', content: block.code }
      } else if (['markdown', 'md'].includes(lang)) {
        return { type: 'markdown', content: block.code }
      } else if (['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'c', 'cpp', 'json', 'yaml', 'sql', 'bash', 'shell'].includes(lang)) {
        return { type: 'code', content: block.code }
      } else {
        return { type: 'code', content: block.code }
      }
    }

    // 如果有多个代码块，合并它们
    const allCode = codeBlocks.map(b => `// ${b.language}\n${b.code}`).join('\n\n')
    return { type: 'code', content: allCode }
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
 * 翻译专家名称
 */
export function translateExpertName(name: string, t: (key: string) => string): string {
  const nameMap: Record<string, string> = {
    'Task Planning': t('planningExpert') || '规划专家',
    'planner': t('planningExpert') || '规划专家',
    'commander': t('commander') || '指挥官',
    'search': t('searchExpertName') || '搜索专家',
    'coding': t('codingExpert') || '编程专家',
    'research': t('researchExpert') || '研究专家',
    'analyzer': t('analyzerExpertName') || '分析专家',
    'writing': t('writingExpert') || '写作专家',
  }
  return nameMap[name] || name
}
