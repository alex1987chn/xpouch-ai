/**
 * 格式化工具函数
 */

export interface OutputSource {
  title?: string
  url?: string
}

export interface OutputResult {
  content?: string
  source?: OutputSource[]
  sources?: unknown
}

/**
 * 将任务输出结果格式化为 Markdown 字符串
 */
export const formatTaskOutput = (outputResult: OutputResult | string | null | undefined): string => {
  if (!outputResult) return ''

  if (typeof outputResult === 'string') return outputResult

  let formattedText = outputResult.content || ''

  if (outputResult.source && Array.isArray(outputResult.source) && outputResult.source.length > 0) {
    formattedText += '\n\n---\n**参考来源：**\n'
    outputResult.source.forEach((src: OutputSource, index: number) => {
      const title = src.title || '未知来源'
      const url = src.url || '#'
      formattedText += `> ${index + 1}. [${title}](${url})\n`
    })
  } else if (outputResult.sources) {
    formattedText += '\n\n**参考资料:** ' + JSON.stringify(outputResult.sources)
  }

  return formattedText
}
