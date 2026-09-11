import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.css'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import CodeArtifact from './CodeArtifact'
import HtmlArtifact from './HtmlArtifact'

interface DocArtifactProps {
  content: string
  className?: string
  isStreaming?: boolean  // 🔥 新增：流式生成状态
}

/**
 * DocArtifact - Markdown 文档渲染容器
 * 
 * 职责：渲染 Markdown 内容，排版文字
 * 遇到代码块时：甩给 CodeArtifact（智能中枢处理）
 * 
 * 保持 3 Core Types 架构：
 * - markdown → 本文档组件渲染
 * - code → CodeArtifact 处理（含 mermaid/json-chart 等）
 * - html → HtmlArtifact 渲染
 */
export default function DocArtifact({ content, className, isStreaming }: DocArtifactProps) {
  const { t } = useTranslation()
  return (
    <div className={cn('w-full h-full overflow-auto p-4', className)}>
      <div className="prose prose-sm max-w-none w-full min-h-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold text-content-primary border-b border-border-divider pb-2 mb-4 mt-6">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-semibold text-content-primary border-b border-border-divider pb-2 mb-3 mt-5">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-semibold text-content-primary mt-4 mb-2">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-base font-semibold text-content-primary mt-3 mb-2">
                {children}
              </h4>
            ),
            h5: ({ children }) => (
              <h5 className="text-sm font-semibold text-content-primary mt-2 mb-1">
                {children}
              </h5>
            ),
            h6: ({ children }) => (
              <h6 className="text-xs font-semibold text-content-primary mt-2 mb-1">
                {children}
              </h6>
            ),
            p: ({ children }) => (
              <p className="text-content-secondary leading-relaxed mb-4">
                {children}
              </p>
            ),
            a: ({ children, href }) => {
              const linkHref = typeof href === 'string' ? href : ''
              const linkText = String(children || '')
              
              // 🔥 检测是否为媒体链接
              const hasImageExt = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(linkHref)
              const hasVideoExt = /\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(linkHref)
              const isOssImage = /(oss-|aliyuncs|s3\.amazonaws|cloudfront|storage\.googleapis|blob\.core\.windows)\.com.*(watermark|image|img|photo|pic)/i.test(linkHref)
              const textSuggestsImage = /图片|image|photo|pic|图/i.test(linkText)
              const urlHasImageParam = /[?&](image|img|url|src)=/i.test(linkHref)
              
              const shouldRenderAsImage = hasImageExt || (isOssImage && textSuggestsImage) || urlHasImageParam
              const shouldRenderAsVideo = hasVideoExt
              
              if (shouldRenderAsImage) {
                // 检查 OSS 链接是否可能已过期
                const expireMatch = linkHref.match(/[?&]Expires=(\d+)/)
                const isExpired = expireMatch && Number(expireMatch[1]) * 1000 < Date.now()
                
                return (
                  <span className="block my-3">
                    <img
                      src={linkHref}
                      alt={linkText || 'Image'}
                      className="max-w-full max-h-[400px] rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                      loading="lazy"
                      onClick={() => window.open(linkHref, '_blank')}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                      }}
                    />
                    {isExpired && (
                      <span className="text-xs text-amber-600 block mt-1">
                        ⚠️ 图片链接已过期，请重新生成
                      </span>
                    )}
                    <a
                      href={linkHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline text-xs block mt-1"
                    >
                      {children}
                    </a>
                  </span>
                )
              }
              
              if (shouldRenderAsVideo) {
                return (
                  <span className="block my-3">
                    <video
                      src={linkHref}
                      controls
                      className="max-w-full max-h-[400px] rounded-lg shadow-md"
                      preload="metadata"
                      onError={(e) => {
                        const target = e.target as HTMLVideoElement
                        target.style.display = 'none'
                      }}
                    >
                      您的浏览器不支持视频播放
                    </video>
                    <a
                      href={linkHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline text-xs block mt-1"
                    >
                      {children}
                    </a>
                  </span>
                )
              }
              
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {children}
                </a>
              )
            },
            ul: ({ children }) => (
              <ul className="list-disc pl-6 mb-4 text-content-secondary space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-6 mb-4 text-content-secondary space-y-1">
                {children}
              </ol>
            ),
            code: ({ children, className: codeClassName }) => {
              const isInline = !codeClassName?.includes('language-')
              const match = /language-(\w+)/.exec(codeClassName || '')
              const lang = match ? match[1] : ''
              const codeContent = String(children).replace(/\n$/, '')

              // 行内代码
              if (isInline) {
                // 🔥 检测行内代码是否是媒体链接（被 ` ` 包裹的链接）
                const hasImageExt = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(codeContent)
                const hasVideoExt = /\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(codeContent)
                
                if (hasImageExt || hasVideoExt) {
                  const expireMatch = codeContent.match(/[?&]Expires=(\d+)/)
                  const isExpired = expireMatch && Number(expireMatch[1]) * 1000 < Date.now()
                  
                  return (
                    <span className="block my-3">
                      {hasImageExt ? (
                        <img
                          src={codeContent}
                          alt="Image"
                          className="max-w-full max-h-[400px] rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                          loading="lazy"
                          onClick={() => window.open(codeContent, '_blank')}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                          }}
                        />
                      ) : (
                        <video
                          src={codeContent}
                          controls
                          className="max-w-full max-h-[400px] rounded-lg shadow-md"
                          preload="metadata"
                          onError={(e) => {
                            const target = e.target as HTMLVideoElement
                            target.style.display = 'none'
                          }}
                        >
                          您的浏览器不支持视频播放
                        </video>
                      )}
                      {isExpired && (
                        <span className="text-xs text-amber-600 block mt-1">
                          ⚠️ 链接已过期，请重新生成
                        </span>
                      )}
                      <code className="block mt-1 bg-surface-elevated px-1.5 py-0.5 text-xs text-content-muted font-mono rounded">
                        {codeContent.slice(0, 60)}...
                      </code>
                    </span>
                  )
                }
                
                return (
                  <code className="bg-surface-elevated px-1.5 py-0.5 border border-border-default/50 text-sm text-content-primary font-mono rounded">
                    {children}
                  </code>
                )
              }

              // 🔥 核心改动：HTML 交给 HtmlArtifact
              if (lang === 'html') {
                // 截断检测：完整 HTML 文档必然有 </html>；缺失说明被输出上限截断，
                // 文档可能只有 <head>（无可见内容），预览会是空白
                const isTruncatedDoc = /<html[\s>]/i.test(codeContent) && !/<\/html\s*>/i.test(codeContent)
                return (
                  <div className="my-4">
                    {isTruncatedDoc && (
                      <div className="flex items-start gap-2 mb-2 px-3 py-2 border border-amber-500/60 bg-amber-500/10 text-xs text-amber-700 rounded">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{t('artifactHtmlTruncated')}</span>
                      </div>
                    )}
                    {/* 定高容器：HtmlArtifact 的 iframe h-full 在文档流中会塌缩成默认 150px */}
                    <div className="h-[600px] border border-border-default rounded overflow-hidden bg-white">
                      <HtmlArtifact content={codeContent} />
                    </div>
                  </div>
                )
              }

              // 🔥 核心改动：其他所有（Mermaid/Chart/Python等）全交给 CodeArtifact
              // 注意：这里 showHeader=true 因为是内嵌在 Markdown 中的代码块
              return <CodeArtifact language={lang} content={codeContent} showHeader={true} />
            },
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-content-muted pl-4 italic text-content-secondary my-4">
                {children}
              </blockquote>
            ),
            strong: ({ children }) => (
              <strong className="font-bold text-content-primary">
                {children}
              </strong>
            ),
            em: ({ children }) => (
              <em className="italic text-content-primary">
                {children}
              </em>
            ),
            del: ({ children }) => (
              <del className="line-through text-content-muted">
                {children}
              </del>
            ),
            hr: () => (
              <hr className="my-6 border-t border-border-divider" />
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-border-default">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-surface-elevated">
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-border-default">
                {children}
              </tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-surface-elevated/50">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-4 py-2 text-left font-semibold text-content-primary border border-border-default">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2 text-content-secondary border border-border-default">
                {children}
              </td>
            ),
            input: ({ type, checked }) => (
              <input
                type={type}
                checked={checked}
                disabled={true}
                className="w-4 h-4 mr-2 cursor-not-allowed"
              />
            ),
            sup: ({ children }) => (
              <sup className="text-xs text-accent cursor-pointer">
                {children}
              </sup>
            ),
            img: ({ src, alt }) => {
              // 确保 src 是字符串
              const imageSrc = typeof src === 'string' ? src : ''
              const imageAlt = typeof alt === 'string' ? alt : 'Image'
              
              if (!imageSrc) return null
              
              return (
                <img
                  src={imageSrc}
                  alt={imageAlt}
                  className="rounded-lg shadow-md max-w-full h-auto my-4 cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                  onClick={() => window.open(imageSrc, '_blank')}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
              )
            },
            video: ({ src, controls = true, autoPlay = false, loop = false }) => {
              const videoSrc = typeof src === 'string' ? src : ''
              
              if (!videoSrc) return null
              
              return (
                <video
                  src={videoSrc}
                  controls={controls}
                  autoPlay={autoPlay}
                  loop={loop}
                  className="rounded-lg shadow-md max-w-full h-auto my-4"
                  preload="metadata"
                  onError={(e) => {
                    const target = e.target as HTMLVideoElement
                    target.style.display = 'none'
                  }}
                />
              )
            },
          }}
        >
          {content}
        </ReactMarkdown>
        
        {/* 🔥 新增：流式光标动画 */}
        {isStreaming && (
          <span className="inline-block w-2 h-5 ml-1 bg-primary animate-pulse align-middle rounded-sm" />
        )}
      </div>
    </div>
  )
}
