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
 * 克隆元素并设置固定尺寸（用于 html2canvas 捕获）
 */
function cloneElementWithFixedDimensions(element: HTMLElement): HTMLElement {
  // 创建一个容器
  const container = document.createElement('div')
  container.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    background: #ffffff;
    padding: 20px;
    width: ${element.scrollWidth || 800}px;
    min-height: ${element.scrollHeight || 600}px;
  `
  
  // 克隆元素
  const clone = element.cloneNode(true) as HTMLElement
  clone.style.cssText = `
    width: ${element.scrollWidth || 800}px !important;
    min-height: ${element.scrollHeight || 600}px !important;
    height: auto !important;
    overflow: visible !important;
    background: #ffffff !important;
  `
  
  container.appendChild(clone)
  document.body.appendChild(container)
  
  return container
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

  // 🔥 创建固定尺寸的克隆元素
  const container = cloneElementWithFixedDimensions(element)
  
  try {
    // 等待一帧让 DOM 渲染
    await new Promise(resolve => requestAnimationFrame(resolve))
    
    // 使用 html2canvas 捕获
    const canvas = await html2canvas(container, {
      useCORS: true,
      allowTaint: true, // 允许跨域图片
      logging: false,
      scale: 2,
      backgroundColor: '#ffffff',
      width: container.scrollWidth,
      height: container.scrollHeight,
    })

    // 验证 canvas
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas has zero dimensions')
    }

    // 生成图片
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    
    if (!imgData || !imgData.startsWith('data:image/')) {
      throw new Error('Failed to generate image data')
    }

    // 创建 PDF
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    
    // 计算缩放比例
    const ratio = pageWidth / (canvas.width / 2) // scale=2 所以除以 2
    const imgWidth = pageWidth
    const imgHeight = (canvas.height / 2) * ratio
    
    // 分页处理
    let heightLeft = imgHeight
    let position = 0
    
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }
    
    pdf.save(generateFilename(filename, 'pdf'))
  } finally {
    // 清理克隆的元素
    document.body.removeChild(container)
  }
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
