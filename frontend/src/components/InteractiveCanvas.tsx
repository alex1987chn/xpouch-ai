import { Fragment, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Code, FileText, Search, FileText as TextIcon, FileCode as HtmlIcon, X, Maximize2, Copy, Check } from 'lucide-react'
import { CodeArtifact, DocArtifact, SearchArtifact, HtmlArtifact, TextArtifact } from './artifacts'
import ParticleGrid from './ParticleGrid.tsx'

interface InteractiveCanvasProps {
  className?: string
  artifactType?: 'code' | 'markdown' | 'search' | 'html' | 'text' | null
  artifactContent?: string
  isProcessing?: boolean
  activeExpertId?: string | null
  isFullscreen?: boolean
  setIsFullscreen?: (fullscreen: boolean) => void
}

export default function InteractiveCanvas({
  className,
  artifactType = null,
  artifactContent = '',
  isProcessing = false,
  activeExpertId = null,
  isFullscreen = false,
  setIsFullscreen = () => {}
}: InteractiveCanvasProps) {
  const [copied, setCopied] = useState(false)

  const currentType = artifactType || null
  const currentContent = artifactContent || ''

  const expertNames: Record<string, string> = {
    code: '编程专家',
    markdown: '写作专家',
    search: '搜索专家',
    html: 'HTML 生成',
    text: '文本生成'
  }

  const expertColors: Record<string, { from: string; to: string }> = {
    code: { from: 'from-indigo-500', to: 'to-purple-600' },
    markdown: { from: 'from-emerald-500', to: 'to-teal-600' },
    search: { from: 'from-violet-500', to: 'to-pink-600' },
    html: { from: 'from-orange-500', to: 'to-amber-600' },
    text: { from: 'from-slate-500', to: 'to-gray-600' }
  }

  const handleCopy = async () => {
    console.log('[InteractiveCanvas] handleCopy called, currentContent length:', currentContent.length)
    console.log('[InteractiveCanvas] currentContent preview:', currentContent.substring(0, 100))

    if (!currentContent) {
      console.warn('[InteractiveCanvas] currentContent is empty')
      return
    }

    try {
      await navigator.clipboard.writeText(currentContent)
      console.log('[InteractiveCanvas] Copy successful')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[InteractiveCanvas] Failed to copy:', err)
    }
  }

  return (
    <>
      <div className={cn(
        'relative h-full overflow-hidden flex flex-col',
        className
      )}>
        <ParticleGrid isProcessing={isProcessing} className="absolute inset-0 dark:block hidden z-0 pointer-events-none" />

        <div className="flex-1 overflow-auto">
          <div className="w-full h-full">
            <AnimatePresence mode="wait">
              {currentType ? (
                <motion.div
                  key={currentType}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full flex flex-col"
                >
                  <div className={cn(
                    'rounded-2xl',
                    'bg-white dark:bg-slate-900',
                    'shadow-2xl shadow-black/10 dark:shadow-black/40',
                    'overflow-hidden',
                    'flex-1 flex flex-col relative z-10'
                  )}>
                    <AnimatePresence mode="wait">
                      {currentType && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="relative z-20 flex-shrink-0"
                        >
                          <div
                            className={cn(
                              'w-full px-4 py-2.5 flex items-center justify-between',
                              currentType && expertColors[currentType]
                                ? `bg-gradient-to-r ${expertColors[currentType].from} ${expertColors[currentType].to}`
                                : 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {currentType === 'code' && <Code className="w-4 h-4 text-white" />}
                              {currentType === 'markdown' && <FileText className="w-4 h-4 text-white" />}
                              {currentType === 'search' && <Search className="w-4 h-4 text-white" />}
                              {currentType === 'html' && <HtmlIcon className="w-4 h-4 text-white" />}
                              {currentType === 'text' && <TextIcon className="w-4 h-4 text-white" />}
                              <span className="text-white text-sm font-medium">
                                {expertNames[currentType] || 'AI 生成的结果'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleCopy}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                                title={copied ? '已复制' : '复制'}
                              >
                                {copied ? (
                                  <Check className="w-4 h-4 text-white" />
                                ) : (
                                  <Copy className="w-4 h-4 text-white" />
                                )}
                              </button>
                              <button
                                onClick={() => setIsFullscreen(true)}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                                title="放大预览"
                              >
                                <Maximize2 className="w-4 h-4 text-white" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="flex-1 overflow-hidden">
                      {currentType === 'code' && (
                        <div className="w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y touch-pinch-zoom">
                          <CodeArtifact content={currentContent} />
                        </div>
                      )}
                      {currentType === 'markdown' && (
                        <div className="w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y touch-pinch-zoom">
                          <DocArtifact content={currentContent} />
                        </div>
                      )}
                      {currentType === 'search' && (
                        <div className="w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y touch-pinch-zoom">
                          <SearchArtifact />
                        </div>
                      )}
                      {currentType === 'html' && (
                        <div className="w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y touch-pinch-zoom">
                          <HtmlArtifact content={currentContent} />
                        </div>
                      )}
                      {currentType === 'text' && (
                        <div className="w-full h-full overflow-y-auto overflow-x-hidden touch-pan-y touch-pinch-zoom">
                          <TextArtifact content={currentContent} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full h-full flex items-center justify-center"
                >
                  <div className="text-center max-w-md space-y-6">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center mx-auto">
                      <svg
                        className="w-12 h-12 text-indigo-600 dark:text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1 1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1 1v-6z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                      等待 AI 生成内容
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                      在右侧对话框中描述任务，AI 将在此区域生成代码、文档或其他内容
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  )
}
