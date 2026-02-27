import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.css'
import { cn } from '@/lib/utils'
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
  return (
    <div className={cn('w-full h-full overflow-auto bauhaus-scrollbar p-4', className)}>
      <div className="prose prose-slate dark:prose-invert prose-sm max-w-none w-full min-h-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-50 border-b border-slate-300 dark:border-slate-600 pb-2 mb-4 mt-6">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-50 border-b border-slate-300 dark:border-slate-600 pb-2 mb-3 mt-5">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-4 mb-2">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-3 mb-2">
                {children}
              </h4>
            ),
            h5: ({ children }) => (
              <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-2 mb-1">
                {children}
              </h5>
            ),
            h6: ({ children }) => (
              <h6 className="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-2 mb-1">
                {children}
              </h6>
            ),
            p: ({ children }) => (
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed mb-4">
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
                    <a
                      href={linkHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs block mt-1"
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
                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs block mt-1"
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
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {children}
                </a>
              )
            },
            ul: ({ children }) => (
              <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-200 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-6 mb-4 text-slate-700 dark:text-slate-200 space-y-1">
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
                return (
                  <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 border border-border/50 text-sm text-slate-800 dark:text-slate-200 font-mono rounded">
                    {children}
                  </code>
                )
              }

              // 🔥 核心改动：HTML 交给 HtmlArtifact
              if (lang === 'html') {
                return <HtmlArtifact content={codeContent} />
              }

              // 🔥 核心改动：其他所有（Mermaid/Chart/Python等）全交给 CodeArtifact
              // 注意：这里 showHeader=true 因为是内嵌在 Markdown 中的代码块
              return <CodeArtifact language={lang} content={codeContent} showHeader={true} />
            },
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-slate-400 dark:border-slate-500 pl-4 italic text-slate-600 dark:text-slate-300 my-4">
                {children}
              </blockquote>
            ),
            strong: ({ children }) => (
              <strong className="font-bold text-slate-900 dark:text-slate-100">
                {children}
              </strong>
            ),
            em: ({ children }) => (
              <em className="italic text-slate-800 dark:text-slate-200">
                {children}
              </em>
            ),
            del: ({ children }) => (
              <del className="line-through text-slate-500 dark:text-slate-400">
                {children}
              </del>
            ),
            hr: () => (
              <hr className="my-6 border-t border-slate-300 dark:border-slate-700" />
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-slate-300 dark:border-slate-700">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-slate-100 dark:bg-slate-800">
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-slate-300 dark:divide-slate-700">
                {children}
              </tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-4 py-2 text-left font-semibold text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
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
              <sup className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer">
                {children}
              </sup>
            ),
            img: ({ src, alt, ...props }) => {
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
            video: ({ src, controls = true, autoPlay = false, loop = false, ...props }) => {
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
