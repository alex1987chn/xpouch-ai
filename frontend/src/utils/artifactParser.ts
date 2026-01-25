/**
 * Artifact 解析器
 * 
 * 用于从 AI 助手消息中提取可展示的内容并创建 artifact
 * 支持代码块、markdown、HTML 片段等内容的自动识别
 */

import type { Artifact } from '@/types'

// 代码块正则表达式：匹配 ```language\ncontent\n```
const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g

// HTML 标签正则表达式（简化版，用于检测是否包含 HTML）
const HTML_TAG_REGEX = /<(\w+)[^>]*>[\s\S]*?<\/\1>|<[^>]+\/>/

// Markdown 标题正则表达式
const MARKDOWN_HEADER_REGEX = /^#{1,6}\s+.+/m

// Markdown 列表正则表达式
const MARKDOWN_LIST_REGEX = /^[\s]*[-*+]\s+.+|^[\s]*\d+\.\s+.+/m

// Markdown 链接正则表达式
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/

/**
 * 检测内容类型
 */
export function detectContentType(content: string): Artifact['type'] {
  // 1. 检测是否包含代码块
  const codeMatches = [...content.matchAll(CODE_BLOCK_REGEX)]
  if (codeMatches.length > 0) {
    return 'code'
  }

  // 2. 检测是否包含 HTML 标签
  if (HTML_TAG_REGEX.test(content)) {
    return 'html'
  }

  // 3. 检测是否包含 markdown 格式
  if (
    MARKDOWN_HEADER_REGEX.test(content) ||
    MARKDOWN_LIST_REGEX.test(content) ||
    MARKDOWN_LINK_REGEX.test(content)
  ) {
    return 'markdown'
  }

  // 4. 默认返回纯文本
  return 'text'
}

/**
 * 从内容中提取代码块
 */
export function extractCodeBlocks(content: string): Array<{
  language: string
  code: string
}> {
  const codeBlocks: Array<{ language: string; code: string }> = []
  
  const matches = [...content.matchAll(CODE_BLOCK_REGEX)]
  for (const match of matches) {
    const language = match[1] || 'text'
    const code = match[2].trim()
    codeBlocks.push({ language, code })
  }
  
  return codeBlocks
}

/**
 * 创建 artifact 对象
 */
export function createArtifact(
  type: Artifact['type'],
  content: string,
  title?: string,
  language?: string
): Omit<Artifact, 'id' | 'timestamp'> {
  return {
    type,
    content,
    title: title || getDefaultTitle(type, content),
    language
  }
}

/**
 * 获取默认标题
 */
function getDefaultTitle(type: Artifact['type'], content: string): string {
  const maxLength = 50
  
  switch (type) {
    case 'code':
      // 提取第一行作为标题
      const firstLine = content.split('\n')[0].trim()
      if (firstLine && firstLine.length > 0) {
        return firstLine.length > maxLength 
          ? firstLine.substring(0, maxLength) + '...' 
          : firstLine
      }
      return '代码片段'
      
    case 'markdown':
      // 尝试提取第一个标题
      const headerMatch = content.match(MARKDOWN_HEADER_REGEX)
      if (headerMatch) {
        const header = headerMatch[0].replace(/^#+\s+/, '')
        return header.length > maxLength
          ? header.substring(0, maxLength) + '...'
          : header
      }
      return '文档'
      
    case 'html':
      return 'HTML 片段'
      
    case 'text':
      // 使用前几个字符作为标题
      const preview = content.trim()
      return preview.length > maxLength
        ? preview.substring(0, maxLength) + '...'
        : preview || '文本内容'
        
    default:
      return '交付物'
  }
}

/**
 * 从助手消息中解析并创建 artifacts
 * 优先将完整内容作为一个整体展示，而不是拆分成多个 artifact
 */
export function parseAssistantMessage(
  content: string,
  expertType: string = 'assistant'
): Array<Omit<Artifact, 'id' | 'timestamp'>> {
  const artifacts: Array<Omit<Artifact, 'id' | 'timestamp'>> = []
  
  // 1. 先检测整体内容类型
  const contentType = detectContentType(content)
  
  // 2. 如果是 markdown 或 html 类型，将整个内容作为一个 artifact 展示
  // 这样可以保留完整的 markdown 结构（包含代码块、链接、列表等）
  if (contentType === 'markdown' || contentType === 'html') {
    artifacts.push(createArtifact(contentType, content))
    return artifacts
  }
  
  // 3. 如果是纯代码（只有代码块，没有其他文字），为每个代码块创建 artifact
  const codeBlocks = extractCodeBlocks(content)
  if (codeBlocks.length > 0 && contentType === 'code') {
    // 检查是否只有代码块（没有其他文字说明）
    const remainingContent = content.replace(CODE_BLOCK_REGEX, '').trim()
    if (remainingContent.length === 0 || remainingContent.length < 50) {
      // 纯代码内容，为每个代码块创建 artifact
      for (const { language, code } of codeBlocks) {
        artifacts.push(createArtifact('code', code, `代码: ${language || 'unknown'}`, language))
      }
      return artifacts
    }
  }
  
  // 4. 其他情况（混合内容或纯文本），将整个内容作为一个 artifact
  artifacts.push(createArtifact(contentType, content))
  
  return artifacts
}

/**
 * 判断内容是否适合在 artifact 区域展示
 */
export function shouldDisplayAsArtifact(content: string): boolean {
  const contentType = detectContentType(content)
  
  // 纯文本如果很短，可能不需要在 artifact 区域展示
  if (contentType === 'text') {
    const trimmed = content.trim()
    return trimmed.length > 800 || trimmed.includes('\n')
  }
  
  // 其他类型都应该展示
  return true
}