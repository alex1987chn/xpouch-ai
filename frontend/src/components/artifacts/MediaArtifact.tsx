/**
 * MediaArtifact - 媒体内容渲染组件
 * 
 * 支持图片和视频的渲染
 * - 图片：直接渲染 img 标签
 * - 视频：渲染 video 标签，支持 controls
 */

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ImageIcon, Video, Loader2, AlertCircle } from 'lucide-react'

interface MediaArtifactProps {
  content: string  // 媒体 URL 或包含 URL 的文本
  type?: 'image' | 'video' | 'media'
  className?: string
  title?: string
}

/**
 * 从内容中提取 URL
 * 支持纯 URL 或 Markdown 链接格式 [text](url)
 */
function extractUrl(content: string): string | null {
  // 首先尝试匹配 Markdown 链接格式 [text](url)
  const markdownMatch = content.match(/\[([^\]]*)\]\(([^)]+)\)/)
  if (markdownMatch) {
    return markdownMatch[2].trim()
  }
  
  // 然后尝试匹配纯 URL
  const urlMatch = content.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/i)
  if (urlMatch) {
    return urlMatch[0]
  }
  
  // 最后尝试直接返回内容（如果内容本身就是一个 URL）
  const trimmed = content.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  
  return null
}

/**
 * 检测内容类型（图片或视频）
 */
function detectMediaType(url: string, explicitType?: string): 'image' | 'video' {
  if (explicitType && explicitType !== 'media') {
    return explicitType as 'image' | 'video'
  }
  
  const lowerUrl = url.toLowerCase()
  
  // 视频格式
  if (/\.(mp4|webm|ogg|mov|mkv|avi|flv|wmv)(\?.*)?$/i.test(lowerUrl)) {
    return 'video'
  }
  
  // 图片格式
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(lowerUrl)) {
    return 'image'
  }
  
  // 默认根据内容特征判断
  if (lowerUrl.includes('video') || lowerUrl.includes('mp4') || lowerUrl.includes('watch')) {
    return 'video'
  }
  
  return 'image'
}

export default function MediaArtifact({ content, type = 'media', className, title }: MediaArtifactProps) {
  const url = extractUrl(content)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  
  const mediaType = url ? detectMediaType(url, type === 'media' ? undefined : type) : 'image'
  
  const handleLoad = useCallback(() => {
    setIsLoading(false)
    setHasError(false)
  }, [])
  
  const handleError = useCallback(() => {
    setIsLoading(false)
    setHasError(true)
  }, [])
  
  const handleRetry = useCallback(() => {
    setIsLoading(true)
    setHasError(false)
    setRetryCount(prev => prev + 1)
  }, [])
  
  if (!url) {
    return (
      <div className={cn('w-full h-full flex items-center justify-center text-muted-foreground', className)}>
        <div className="flex flex-col items-center gap-2">
          <AlertCircle className="w-8 h-8" />
          <span className="text-sm">无法识别有效的媒体链接</span>
          <code className="text-xs bg-muted px-2 py-1 rounded">{content.slice(0, 100)}...</code>
        </div>
      </div>
    )
  }
  
  return (
    <div className={cn('w-full h-full flex flex-col', className)}>
      {/* 标题栏 */}
      {(title || url) && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-panel shrink-0">
          {mediaType === 'video' ? (
            <Video className="w-4 h-4 text-blue-500" />
          ) : (
            <ImageIcon className="w-4 h-4 text-green-500" />
          )}
          <span className="text-xs font-mono text-muted-foreground truncate flex-1">
            {title || url.split('/').pop() || '媒体文件'}
          </span>
        </div>
      )}
      
      {/* 媒体内容 */}
      <div className="flex-1 overflow-auto bauhaus-scrollbar p-4 flex items-center justify-center bg-muted/30">
        {mediaType === 'video' ? (
          <div className="w-full max-w-4xl">
            <video
              key={`${url}-${retryCount}`}
              src={url}
              controls
              className="w-full h-auto max-h-[70vh] rounded-lg shadow-lg"
              onLoadedData={handleLoad}
              onError={handleError}
              preload="metadata"
            >
              您的浏览器不支持视频播放
            </video>
            
            {/* 加载状态 */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">加载视频中...</span>
                </div>
              </div>
            )}
            
            {/* 错误状态 */}
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90">
                <div className="flex flex-col items-center gap-3">
                  <AlertCircle className="w-10 h-10 text-red-500" />
                  <span className="text-sm text-muted-foreground">视频加载失败</span>
                  <button
                    onClick={handleRetry}
                    className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                  >
                    重试
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <img
              key={`${url}-${retryCount}`}
              src={url}
              alt={title || 'Generated image'}
              className="max-w-full max-h-[70vh] w-auto h-auto rounded-lg shadow-lg object-contain"
              onLoad={handleLoad}
              onError={handleError}
              loading="lazy"
            />
            
            {/* 加载状态 */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">加载图片中...</span>
                </div>
              </div>
            )}
            
            {/* 错误状态 */}
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90 rounded-lg">
                <div className="flex flex-col items-center gap-3">
                  <AlertCircle className="w-10 h-10 text-red-500" />
                  <span className="text-sm text-muted-foreground">图片加载失败</span>
                  <button
                    onClick={handleRetry}
                    className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                  >
                    重试
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 底部信息 */}
      <div className="px-3 py-2 border-t border-border bg-panel shrink-0">
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block"
        >
          {url}
        </a>
      </div>
    </div>
  )
}
