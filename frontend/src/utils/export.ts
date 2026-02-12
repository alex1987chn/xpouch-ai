/**
 * Artifact 导出工具函数
 * 支持 Markdown 和 PDF 两种格式导出
 */

import { jsPDF } from 'jspdf'

/**
 * 生成带时间戳的文件名
 */
function generateFilename(title: string, ext: string): string {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30)
  return `${sanitizedTitle}_${timestamp}.${ext}`
}

/**
 * 下载 Markdown 文件
 * @param filename 文件名（不含扩展名）
 * @param content Markdown 内容
 */
export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  
  link.href = url
  link.download = generateFilename(filename, 'md')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 下载 PDF 文件（基于文本内容）
 * @param content 要导出的文本内容
 * @param filename 文件名（不含扩展名）
 * @returns Promise<void>
 */
export async function downloadPDF(content: string, filename: string): Promise<void> {
  if (!content || content.trim().length === 0) {
    throw new Error('Content is empty')
  }

  // 创建 PDF（A4 纸）
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15 // 边距 (mm)
  const lineHeight = 6 // 行高 (mm)
  
  // 设置字体
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  
  // 计算可用宽度
  const maxWidth = pageWidth - margin * 2
  
  // 分割内容为行
  const lines = content.split('\n')
  let y = margin
  
  for (const line of lines) {
    // 处理空行
    if (line.trim() === '') {
      y += lineHeight * 0.5
      continue
    }
    
    // 使用 splitTextToSize 自动换行
    const wrappedLines = pdf.splitTextToSize(line, maxWidth)
    
    for (const wrappedLine of wrappedLines) {
      // 检查是否需要新页面
      if (y + lineHeight > pageHeight - margin) {
        pdf.addPage()
        y = margin
      }
      
      // 写入文本
      pdf.text(wrappedLine, margin, y)
      y += lineHeight
    }
  }
  
  pdf.save(generateFilename(filename, 'pdf'))
}

/**
 * 下载 PDF 文件（基于 DOM 元素 - 备选方案）
 * 使用内容直接生成，避免 html2canvas 的各种问题
 * @param elementId 要导出的 DOM 元素 ID
 * @param filename 文件名（不含扩展名）
 * @returns Promise<void>
 */
export async function downloadPDFFromElement(elementId: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`)
  }

  // 获取元素的文本内容
  let content = ''
  
  // 尝试从 CodeArtifact (pre/code) 获取
  const codeElement = element.querySelector('pre code') || element.querySelector('pre')
  if (codeElement?.textContent) {
    content = codeElement.textContent
  }
  
  // 尝试从 DocArtifact (article/div) 获取
  if (!content) {
    const docElement = element.querySelector('article') || element.querySelector('[data-artifact-content]')
    if (docElement?.textContent) {
      content = docElement.textContent
    }
  }
  
  // 兜底：获取整个元素的文本
  if (!content) {
    content = element.textContent || ''
  }
  
  // 使用文本内容生成 PDF
  await downloadPDF(content, filename)
}

/**
 * 获取 Artifact 的 Markdown 内容
 * 根据 artifact 类型生成合适的 Markdown 格式
 */
export function getArtifactMarkdown(artifact: {
  title?: string
  type: string
  language?: string
  content: string
}): string {
  const title = artifact.title || 'Untitled'
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  
  let content = ''
  
  // 添加 YAML frontmatter
  content += `---\n`
  content += `title: ${title}\n`
  content += `type: ${artifact.type}\n`
  content += `language: ${artifact.language || 'text'}\n`
  content += `exported_at: ${now}\n`
  content += `---\n\n`
  
  // 添加标题
  content += `# ${title}\n\n`
  
  // 根据类型格式化内容
  if (artifact.type === 'code' && artifact.language) {
    content += `\`\`\`${artifact.language}\n`
    content += artifact.content
    content += `\n\`\`\`\n`
  } else if (artifact.type === 'mermaid') {
    content += `\`\`\`mermaid\n`
    content += artifact.content
    content += `\n\`\`\`\n`
  } else {
    // markdown 或 text 直接输出
    content += artifact.content
  }
  
  return content
}
