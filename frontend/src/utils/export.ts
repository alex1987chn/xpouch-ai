/**
 * Artifact 导出工具函数
 * 支持 Markdown 和 PDF 两种格式导出
 */

import html2canvas from 'html2canvas'
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
 * 下载 PDF 文件
 * @param elementId 要导出的 DOM 元素 ID
 * @param filename 文件名（不含扩展名）
 * @returns Promise<void>
 */
export async function downloadPDF(elementId: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`)
  }

  // 🔥 修复：保存当前滚动位置
  const originalScrollY = window.scrollY
  const originalScrollX = window.scrollX
  
  // 🔥 修复：滚动到顶部，确保从正确位置开始捕获
  window.scrollTo(0, 0)

  // 使用 html2canvas 捕获 DOM（完整内容，不仅仅是可见区域）
  const canvas = await html2canvas(element, {
    useCORS: true,
    logging: false,
    scale: 2, // 提高清晰度
    backgroundColor: null, // 保留原有背景色（跟随主题）
    // 🔥 关键修复：捕获完整内容，不仅仅是可见区域
    scrollY: -window.scrollY, // 修正滚动偏移
    scrollX: -window.scrollX, // 修正水平滚动偏移
    windowHeight: element.scrollHeight + 100, // 完整高度 + 缓冲
    windowWidth: element.scrollWidth,
  })

  // 🔥 恢复滚动位置
  window.scrollTo(originalScrollX, originalScrollY)

  // 计算 PDF 尺寸（A4 纸）
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF('p', 'mm', 'a4')
  
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()
  
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  
  // 计算缩放比例，使内容宽度适应 PDF 页面宽度
  const ratio = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight)
  
  const imgWidth = canvasWidth * ratio
  const imgHeight = canvasHeight * ratio
  
  // 如果内容超出一页，需要分页处理
  let heightLeft = imgHeight
  let position = 0
  
  // 添加第一页
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
  heightLeft -= pdfHeight
  
  // 如果内容超出一页，添加更多页面
  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pdfHeight
  }
  
  pdf.save(generateFilename(filename, 'pdf'))
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
