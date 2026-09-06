import { describe, it, expect, beforeAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n'
import DocArtifact from '../DocArtifact'

// HtmlArtifact 会为 iframe 创建 Blob URL，jsdom 未实现
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
})

const renderDoc = (content: string) =>
  render(
    <I18nProvider>
      <DocArtifact content={content} />
    </I18nProvider>
  )

describe('DocArtifact 内嵌 HTML 代码块', () => {
  // jsdom 的 navigator.language 决定 I18nProvider 的语言（en/zh），断言需兼容双语
  const bannerPattern = /HTML (生成不完整|is incomplete)/

  it('截断的 HTML 文档应显示截断警告横幅', () => {
    const truncated = '```html:index.html\n<!DOCTYPE html>\n<html>\n<head>\n<style>.a{}</style>\n'
    renderDoc(truncated)
    expect(screen.getByText(bannerPattern)).toBeInTheDocument()
  })

  it('完整的 HTML 文档不应显示截断警告', () => {
    const complete = '```html:index.html\n<html>\n<head></head>\n<body><p>hi</p></body>\n</html>\n```'
    renderDoc(complete)
    expect(screen.queryByText(bannerPattern)).not.toBeInTheDocument()
  })
})
