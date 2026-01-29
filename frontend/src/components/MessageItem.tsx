import { useState, useCallback } from 'react';
import { Copy, RefreshCw, RotateCcw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MessageItemProps {
  message: Message;
  agentName: string;
  agentAvatar?: string;
  isStreaming?: boolean;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onResend?: () => void;
}

export function MessageItem({
  message,
  agentName,
  agentAvatar,
  isStreaming = false,
  onCopy,
  onRegenerate,
  onResend
}: MessageItemProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [message.content, onCopy]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Bauhaus 风格头像
  const Avatar = () => (
    <div className={cn(
      'w-8 h-8 flex items-center justify-center border-2 flex-shrink-0',
      isUser
        ? 'bg-[var(--accent-hover)] text-black border-black'
        : 'bg-[var(--text-primary)] text-[var(--bg-card)] border-[var(--border-color)]'
    )}>
      {isUser ? (
        <span className="font-mono text-sm font-bold">U</span>
      ) : agentAvatar ? (
        <img src={agentAvatar} alt={agentName} className="w-full h-full object-cover" />
      ) : (
        <span className="font-mono text-sm font-bold">
          {agentName.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );

  // Bauhaus 风格操作按钮
  const ActionButtons = () => (
    <div className={cn(
      'flex items-center gap-1 transition-opacity duration-150',
      isHovered ? 'opacity-100' : 'opacity-0'
    )}>
      <button
        onClick={handleCopy}
        className={cn(
          'p-1.5 border-2 border-[var(--border-color)] transition-all',
          'hover:bg-[var(--accent-hover)] hover:text-black hover:border-black',
          'active:translate-x-[1px] active:translate-y-[1px]'
        )}
        title={copied ? 'Copied' : 'Copy'}
      >
        {copied ? (
          <Check className="w-3 h-3" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
      
      {isUser && onResend && (
        <button
          onClick={onResend}
          className={cn(
            'p-1.5 border-2 border-[var(--border-color)] transition-all',
            'hover:bg-[var(--accent-hover)] hover:text-black hover:border-black',
            'active:translate-x-[1px] active:translate-y-[1px]'
          )}
          title="Resend"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
      
      {!isUser && onRegenerate && (
        <button
          onClick={onRegenerate}
          className={cn(
            'p-1.5 border-2 border-[var(--border-color)] transition-all',
            'hover:bg-[var(--accent-hover)] hover:text-black hover:border-black',
            'active:translate-x-[1px] active:translate-y-[1px]'
          )}
          title="Regenerate"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'flex gap-3 group',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 头像 */}
      <Avatar />

      {/* 消息内容区域 */}
      <div className={cn(
        'flex flex-col gap-1 max-w-[calc(100%-80px)]',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* 头部：名称和时间 */}
        <div className={cn(
          'flex items-center gap-2',
          isUser && 'flex-row-reverse'
        )}>
          <span className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase">
            {isUser ? 'USER' : agentName.toUpperCase()}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {formatTime(message.timestamp)}
          </span>
        </div>

        {/* 消息气泡 - Bauhaus 风格 */}
        <div className={cn(
          'relative px-4 py-3 border-2 max-w-full',
          isUser
            ? 'bg-[var(--bg-page)] border-[var(--border-color)] text-[var(--text-primary)]'
            : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)]',
          'shadow-[var(--shadow-color)_2px_2px_0_0]'
        )}>
          {/* 内容 */}
          <div className="font-mono text-sm leading-relaxed break-words prose prose-sm dark:prose-invert max-w-none">
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: ({ children }) => (
                    <pre className="bg-[var(--bg-page)] border-2 border-[var(--border-color)] p-3 overflow-x-auto my-2">
                      {children}
                    </pre>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-[var(--bg-page)] px-1.5 py-0.5 text-[var(--accent-hover)] font-bold">
                        {children}
                      </code>
                    ) : (
                      <code className={className}>{children}</code>
                    );
                  },
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-[var(--accent-hover)] pl-3 my-2 italic">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
            
            {/* 流式指示器 */}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-[var(--accent-hover)] ml-1 animate-pulse" />
            )}
          </div>

          {/* 文件附件显示 */}
          {message.files && message.files.length > 0 && (
            <div className="mt-3 pt-3 border-t-2 border-[var(--border-color)] flex flex-wrap gap-2">
              {message.files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-2 py-1 bg-[var(--bg-page)] border border-[var(--border-color)] text-xs font-mono"
                >
                  <span className="truncate max-w-[150px]">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <ActionButtons />
      </div>
    </div>
  );
}
