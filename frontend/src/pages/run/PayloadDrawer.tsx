/**
 * PayloadDrawer - Payload 数据抽屉面板
 *
 * [设计]
 * 右侧滑出的玻璃质感抽屉面板，展示选中事件的 JSON Payload
 *
 * [交互]
 * - 点击时间线事件展开/关闭
 * - 流畅的 slide-in/slide-out 动画
 * - 支持 JSON 语法高亮
 */

import { X, Copy, Check, Maximize2, Minimize2 } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { CodeBlock } from '@/components/ui/code-block'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ANIMATION_DURATION } from '@/constants/ui'
import type { RunEvent } from '@/types/run'

interface PayloadDrawerProps {
  event: RunEvent | null
  isOpen: boolean
  onClose: () => void
}

export function PayloadDrawer({ event, isOpen, onClose }: PayloadDrawerProps) {
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // 关闭时重置状态
  useEffect(() => {
    if (!isOpen) {
      setCopied(false)
      setIsExpanded(false)
    }
  }, [isOpen])

  // 复制 JSON
  const handleCopy = useCallback(async () => {
    if (!event?.event_data) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(event.event_data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [event])

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // 格式化 JSON
  const jsonContent = event?.event_data
    ? JSON.stringify(event.event_data, null, 2)
    : ''

  const hasPayload = event?.event_data && Object.keys(event.event_data).length > 0

  return (
    <>
      {/* 遮罩层 - 可选，点击关闭 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10 dark:bg-black/20 transition-opacity"
          style={{ opacity: isOpen ? 1 : 0 }}
          onClick={onClose}
        />
      )}

      {/* 抽屉面板 */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full',
          'bg-surface-card/95 backdrop-blur-xl',
          'border-l border-border-default',
          'shadow-[0_0_40px_rgba(0,0,0,0.1)]',
          'transition-all ease-out',
          isExpanded ? 'w-full md:w-[70%]' : 'w-full md:w-[520px]'
        )}
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transitionDuration: `${ANIMATION_DURATION.NORMAL * 1000}ms`,
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-content-primary">
              Payload
            </span>
            {event && (
              <span className="text-xs text-content-tertiary font-mono">
                #{event.id}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* 展开/收起按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? '收起' : '展开'}
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            {/* 复制按钮 */}
            {hasPayload && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleCopy}
                title="复制 JSON"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
            {/* 关闭按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onClose}
              title="关闭 (ESC)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 内容区 */}
        <ScrollArea className="h-[calc(100%-52px)]">
          <div className="p-4">
            {event ? (
              hasPayload ? (
                <div className="space-y-4">
                  {/* 事件信息 */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-content-primary">
                      {event.event_type}
                    </span>
                    <span className="text-xs text-content-tertiary">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {/* JSON 高亮 - 威廉使用横向滚动处理长 JSON 行 */}
                  <div className="rounded-md border border-border-default">
                    <div className="bg-surface-elevated px-3 py-1.5 border-b border-border-default flex items-center justify-between">
                      <span className="text-xs font-mono text-content-secondary">
                        JSON
                      </span>
                      {/* 横向滚动指示器 */}
                      <span className="text-xs text-content-tertiary ml-2">
                        ← 可横向滚动查看长内容
                      </span>
                    </div>
                    <div className="overflow-auto max-h-[60vh]">
                      <CodeBlock
                        code={jsonContent}
                        language="json"
                        showLineNumbers={true}
                        isDarkTheme={false}
                        enableHorizontalScroll={true}
                      />
                    </div>
                  </div>

                  {/* 关联 ID */}
                  {(event.thread_id || event.execution_plan_id || event.task_id) && (
                    <div className="space-y-2 text-xs">
                      <div className="font-medium text-content-secondary">
                        关联信息
                      </div>
                      <div className="space-y-1 font-mono">
                        {event.thread_id && (
                          <div className="flex gap-2">
                            <span className="text-content-tertiary">thread_id:</span>
                            <span className="text-content-primary">{event.thread_id}</span>
                          </div>
                        )}
                        {event.execution_plan_id && (
                          <div className="flex gap-2">
                            <span className="text-content-tertiary">plan_id:</span>
                            <span className="text-content-primary">{event.execution_plan_id}</span>
                          </div>
                        )}
                        {event.task_id && (
                          <div className="flex gap-2">
                            <span className="text-content-tertiary">task_id:</span>
                            <span className="text-content-primary">{event.task_id}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* note */}
                  {event.note && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-content-secondary">
                        备注
                      </div>
                      <p className="text-sm text-content-primary bg-surface-elevated p-2 rounded">
                        {event.note}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-content-secondary">
                  <div className="text-sm">此事件无 Payload 数据</div>
                  <div className="text-xs text-content-tertiary mt-1">
                    {event.event_type}
                  </div>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-content-secondary">
                <div className="text-sm">选择事件查看详情</div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  )
}
