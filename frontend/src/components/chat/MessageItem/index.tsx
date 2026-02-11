/**
 * 消息项组件
 * 展示单条消息，支持用户消息和AI消息两种样式
 */

import { useState, useCallback } from 'react'
import { Copy, Check, RefreshCw, Eye } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useTaskStore } from '@/store/taskStore'
import type { MessageItemProps } from '../types'
import { extractCodeBlocks, detectContentType } from '../utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { SIMPLE_TASK_ID } from '@/constants/task'
import { StatusAvatar } from '@/components/ui/StatusAvatar'

export default function MessageItem({
  message,
  activeExpert,
  aiStatus = 'idle',
  onRegenerate,
  onLinkClick,
  onPreview,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()

  // 🔥 修复：确保 content 是字符串
  const content = message.content || ''
  
  // 检查是否有可预览的代码块
  const codeBlocks = extractCodeBlocks(content)
  const hasPreviewContent = codeBlocks.length > 0 || content.length > 200

  // 处理预览 - 将内容发送到 artifact 区域（使用新协议 taskStore）
  const handlePreview = useCallback(() => {
    const taskStore = useTaskStore.getState()
    const detected = detectContentType(codeBlocks, content)
    
    if (!detected && content.length <= 200) return

    // 构造符合新协议的 artifact 数据（使用下划线命名匹配后端协议）
    // 🔥 3 Core Types 架构：language 字段从 detected 中获取（由 utils.ts 统一处理）
    const artifact = {
      id: crypto.randomUUID(),
      type: detected?.type || 'markdown',
      title: detected?.type === 'code' ? '代码预览' 
        : detected?.type === 'html' ? 'HTML 预览' 
        : '消息预览',
      content: detected?.content || content,
      language: detected?.language,  // 👈 从 ContentTypeResult 获取
      sort_order: 0
    }

    // Simple 模式：创建/复用一个虚拟任务来承载 artifact
    // 检查当前是否已经有 Simple 模式任务
    const hasSimpleTask = taskStore.mode === 'simple' && taskStore.tasks.has(SIMPLE_TASK_ID)
    
    if (!hasSimpleTask) {
      // 需要初始化：先设置模式（这会清空 tasks），然后创建任务
      console.log('[Preview] Initializing simple mode')
      taskStore.setMode('simple')
      taskStore.initializePlan({
        session_id: 'simple_preview',
        summary: '简单对话模式',
        estimated_steps: 1,
        execution_mode: 'sequential',
        tasks: [{
          id: SIMPLE_TASK_ID,
          expert_type: 'assistant',
          description: '简单对话预览',
          status: 'completed',
          sort_order: 0
        }]
      })
    } else {
      // 已经有 Simple 任务，确保模式是 simple（不会清空已有 tasks）
      taskStore.setMode('simple')
    }
    
    // 替换 artifact 到虚拟任务（简单模式：替换而不是追加）
    console.log('[Preview] Replacing artifact:', artifact.title, 'to task:', SIMPLE_TASK_ID)
    taskStore.replaceArtifacts(SIMPLE_TASK_ID, [{
      id: artifact.id,
      type: artifact.type as any,
      title: artifact.title,
      content: artifact.content,
      language: artifact.language,
      sortOrder: artifact.sort_order,
      createdAt: new Date().toISOString(),
      isPreview: true  // 🔥 标记为预览 artifact，禁止编辑
    }])
    
    // 选中该任务
    taskStore.selectTask(SIMPLE_TASK_ID)
    
    console.log('[Preview] Current tasksCache:', taskStore.tasksCache)
    console.log('[Preview] Current mode:', taskStore.mode)
  }, [content, codeBlocks, onPreview])

  // 处理复制
  const handleCopy = useCallback(async () => {
    const textToCopy = content
    if (!textToCopy) return

    try {
      // 首选: Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        return
      }

      // 降级方案
      const textarea = document.createElement('textarea')
      textarea.value = textToCopy
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'
      document.body.appendChild(textarea)

      const range = document.createRange()
      range.selectNode(textarea)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      textarea.select()
      textarea.setSelectionRange(0, textToCopy.length)

      const successful = document.execCommand('copy')
      if (successful) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }

      document.body.removeChild(textarea)
    } catch {
      // 复制失败静默处理
    }
  }, [message])

  // 处理重试
  const handleRetry = useCallback(() => {
    if (message.id && onRegenerate) {
      onRegenerate(message.id)
    }
  }, [message.id, onRegenerate])

  // 用户消息：深色代码块风格
  if (isUser) {
    return (
      <div className="flex flex-col items-end group user-message">
        <div className="flex items-center gap-2 mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <span className="font-mono text-[9px] uppercase text-primary/50 dark:text-primary/40">
            ID: {String(message.id ?? '').slice(0, 6)} // USER
          </span>
        </div>
        <div className="bg-primary text-inverted p-5 shadow-hard border-2 border-transparent w-fit max-w-[80%] select-text">
          <div className="flex gap-3">
            <span className="font-mono text-[var(--accent)] font-bold shrink-0">&gt;_</span>
            <p className="font-mono text-sm leading-relaxed whitespace-pre-wrap select-text text-inverted">
              {content}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // AI 消息：无气泡，全宽展示（现代 AI 界面风格）
  return (
    <div className="flex flex-col items-start w-full select-text ai-message group">
      {/* 头部：头像 + 标签 + 时间 */}
      <div className="flex items-center gap-2 mb-3">
        {/* 头像容器 - 使用 StatusAvatar 组件 */}
        <StatusAvatar 
          status={aiStatus}
          className="w-6 h-6"
        />
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          {activeExpert ? `${activeExpert.toUpperCase()}_AGENT` : 'ASSISTANT'}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/50">
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
        </span>
      </div>

      {/* 内容区：无气泡背景，直接展示 */}
      <div className="w-full pl-7 prose prose-sm max-w-none dark:prose-invert 
        prose-headings:text-sm prose-headings:font-bold prose-headings:text-foreground
        prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground/90
        prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted/50 
        prose-pre:border prose-pre:border-border/30 prose-a:text-blue-600 dark:prose-a:text-blue-400 
        select-text">
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              a: ({ node, ...props }) => (
                <a
                  {...props}
                  onClick={(e) => {
                    if (props.href?.startsWith('#')) {
                      e.preventDefault()
                      onLinkClick?.(props.href)
                    }
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        ) : aiStatus !== 'idle' ? (
          /* 🔥 占位状态：正在生成中但内容为空 */
          <span className="text-muted-foreground/50 italic">
            {aiStatus === 'thinking' ? '思考中...' : '生成中...'}
          </span>
        ) : null}
      </div>

      {/* 底部操作栏：悬停显示，更简洁 */}
      <div className="pl-7 mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {/* 预览按钮 */}
        {hasPreviewContent && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handlePreview()
            }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
            title={t('preview')}
          >
            <Eye className="w-3 h-3" />
            {t('preview')}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleCopy()
          }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
          title={t('copy')}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              {t('copied')}
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              {t('copy')}
            </>
          )}
        </button>
        {onRegenerate && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleRetry()
            }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
            title={t('regenerate')}
          >
            <RefreshCw className="w-3 h-3" />
            {t('retry')}
          </button>
        )}
      </div>
    </div>
  )
}
