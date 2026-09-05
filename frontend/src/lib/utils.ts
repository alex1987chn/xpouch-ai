import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * 注册自定义字号 token（text-nano/micro/tiny），
 * 否则 tailwind-merge 会把未知 text-* 误判为文字颜色，
 * 与同元素的 text-content-* 冲突时直接删除字号类。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["nano", "micro", "tiny"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
