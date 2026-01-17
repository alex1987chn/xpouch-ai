import { useCallback } from 'react'

/**
 * 魔法颜色映射 - 中文颜色名到HEX值
 */
const COLOR_MAP: Record<string, string> = {
  '红': '#ef4444', '红色': '#ef4444',
  '蓝': '#3b82f6', '蓝色': '#3b82f6',
  '绿': '#22c55e', '绿色': '#22c55e',
  '黄': '#eab308', '黄色': '#eab308',
  '紫': '#8b5cf6', '紫色': '#8b5cf6',
  '粉': '#ec4899', '粉色': '#ec4899',
  '橙': '#f97316', '橙色': '#f97316'
}

/**
 * 魔法颜色解析 Hook
 * 解析AI消息中的"把X改成Y色/颜色"指令
 */
export function useMagicColorParser(setMagicColor: (color: string) => void) {
  /**
   * 解析消息中的魔法颜色指令
   * @param message - 消息内容
   * @returns 是否成功解析到颜色
   */
  const parseMagicColor = useCallback((message: string): boolean => {
    if (!message || typeof message !== 'string') return false

    // 匹配 "把(目标)改成?(颜色)(?:色|颜色)?" 模式
    // 例如: "把背景改成红色", "把文字改成蓝颜色"
    const magicMatch = message.match(/把(.*?)改成?(.*?)(?:色|颜色)?/i)
    if (magicMatch && magicMatch[2]) {
      const color = magicMatch[2].trim()

      if (COLOR_MAP[color]) {
        setMagicColor(COLOR_MAP[color])
        return true
      }
    }
    return false
  }, [setMagicColor])

  return { parseMagicColor }
}
