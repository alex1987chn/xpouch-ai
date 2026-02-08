/**
 * 解析消息内容中的 <think></think> 标签
 * 支持 DeepSeek 等模型的推理内容提取
 */

export interface ParsedMessage {
  /** 主内容（去除 think 标签后的内容） */
  content: string
  /** 思考过程（如果有） */
  thinking?: string
  /** 是否有思考内容 */
  hasThinking: boolean
}

/**
 * 解析消息中的 <think></think> 标签
 * 
 * 支持格式：
 * 1. <think>思考内容</think>
 * 2. <thinking>思考内容</thinking>
 * 3. <reasoning>思考内容</reasoning>
 * 
 * 嵌套标签也会被正确处理
 */
export function parseThinkTags(content: string): ParsedMessage {
  if (!content) {
    return { content: '', hasThinking: false }
  }

  // 匹配 <think>...</think>（支持嵌套）
  const thinkRegex = /<think>([\s\S]*?)<\/think>/
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/
  const reasoningRegex = /<reasoning>([\s\S]*?)<\/reasoning>/

  let thinking = ''
  let mainContent = content
  let hasThinking = false

  // 尝试匹配各种格式的思考标签
  const thinkMatch = content.match(thinkRegex)
  const thinkingMatch = content.match(thinkingRegex)
  const reasoningMatch = content.match(reasoningRegex)

  if (thinkMatch) {
    thinking = thinkMatch[1].trim()
    mainContent = content.replace(thinkMatch[0], '').trim()
    hasThinking = true
  } else if (thinkingMatch) {
    thinking = thinkingMatch[1].trim()
    mainContent = content.replace(thinkingMatch[0], '').trim()
    hasThinking = true
  } else if (reasoningMatch) {
    thinking = reasoningMatch[1].trim()
    mainContent = content.replace(reasoningMatch[0], '').trim()
    hasThinking = true
  }

  // 检查是否还有嵌套的 think 标签（简单处理，只处理一层）
  if (hasThinking && mainContent.includes('<think>')) {
    const nestedMatch = mainContent.match(thinkRegex)
    if (nestedMatch) {
      thinking += '\n\n' + nestedMatch[1].trim()
      mainContent = mainContent.replace(nestedMatch[0], '').trim()
    }
  }

  return {
    content: mainContent,
    thinking: thinking || undefined,
    hasThinking
  }
}

/**
 * 从流式内容中提取不完整的 think 标签
 * 用于实时解析流式输出的思考内容
 */
export function extractStreamingThink(content: string): {
  mainContent: string
  thinkingContent: string
  isInThinkBlock: boolean
} {
  if (!content) {
    return { mainContent: '', thinkingContent: '', isInThinkBlock: false }
  }

  // 查找 think 标签的位置
  const thinkStart = content.indexOf('<think>')
  const thinkEnd = content.indexOf('</think>')

  // 情况1：没有开始标签
  if (thinkStart === -1) {
    return { mainContent: content, thinkingContent: '', isInThinkBlock: false }
  }

  // 情况2：有开始标签但没有结束标签（正在流式输出思考内容）
  if (thinkStart !== -1 && thinkEnd === -1) {
    const mainContent = content.slice(0, thinkStart)
    const thinkingContent = content.slice(thinkStart + 7) // 7 = '<think>'.length
    return { mainContent, thinkingContent, isInThinkBlock: true }
  }

  // 情况3：有完整的 think 标签
  if (thinkStart !== -1 && thinkEnd !== -1 && thinkEnd > thinkStart) {
    const mainContent = content.slice(0, thinkStart) + content.slice(thinkEnd + 8) // 8 = '</think>'.length
    const thinkingContent = content.slice(thinkStart + 7, thinkEnd)
    return { mainContent, thinkingContent, isInThinkBlock: false }
  }

  return { mainContent: content, thinkingContent: '', isInThinkBlock: false }
}

/**
 * 将思考内容格式化为 ThinkingStep 数组
 * 用于兼容现有的 ThinkingProcess 组件
 */
export function formatThinkingAsSteps(
  thinking: string, 
  status: 'running' | 'completed' = 'completed'
): Array<{
  id: string
  expertType: string
  expertName: string
  content: string
  timestamp: string
  status: 'running' | 'completed' | 'failed'
  type: 'analysis'
}> {
  if (!thinking.trim()) return []

  return [{
    id: 'reasoning-' + Date.now(),
    expertType: 'reasoning',
    expertName: '深度思考',
    content: thinking,
    timestamp: new Date().toISOString(),
    status,
    type: 'analysis'
  }]
}
