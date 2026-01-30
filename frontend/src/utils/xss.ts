/**
 * XSS 防护工具
 * 统一使用 DOMPurify 清理用户输入和 HTML 内容
 */

import DOMPurify from 'dompurify'

/**
 * 清理 HTML 字符串，防止 XSS 攻击
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'span', 'a', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target', 'class', 'style']
  })
}

/**
 * 清理文本内容（包含 Markdown 或 HTML）
 */
export function sanitizeText(text: string): string {
  // 如果包含 HTML 标签，使用 sanitizeHtml
  if (/<[^>]+>/.test(text)) {
    return sanitizeHtml(text)
  }
  // 否则直接返回文本（自动转义特殊字符）
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 创建安全的 dangerouslySetInnerHTML 对象
 */
export function createDangerousHtml(html: string) {
  return {
    __html: sanitizeHtml(html)
  }
}
