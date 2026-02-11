/**
 * =============================
 * 状态头像组件 (StatusAvatar)
 * =============================
 *
 * [架构层级] Layer 3 - UI 基础组件
 *
 * [设计理念] XPouch 机能风品牌调性
 * - 黑/黄配色，赛博朋克光环效果
 * - 头像光环动画表达 AI 状态
 * - 类似 Google Gemini 的流光效果
 *
 * [功能]
 * - idle: 无光效
 * - thinking: 赛博黄/橙色旋转渐变光环（高能运算）
 * - streaming: 黄色呼吸光环（数据传输）
 * - error: 红色呼吸光环（错误状态）
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot } from 'lucide-react';

export type AvatarStatus = 'idle' | 'thinking' | 'streaming' | 'error';

interface StatusAvatarProps {
  src?: string;
  fallback?: React.ReactNode;
  status?: AvatarStatus;
  className?: string;
}

export const StatusAvatar: React.FC<StatusAvatarProps> = ({
  src,
  fallback,
  status = 'idle',
  className,
}) => {
  const isThinking = status === 'thinking';
  const isStreaming = status === 'streaming';
  const isError = status === 'error';

  return (
    <div className={cn("relative flex items-center justify-center w-8 h-8", className)}>
      {/* 光环特效层 */}
      {isThinking && (
        <>
          {/* 外圈旋转渐变光环 - 模拟高能运算 */}
          <div className="absolute inset-[-4px] rounded-full bg-gradient-to-tr from-yellow-500 via-orange-400 to-transparent animate-spin blur-[2px] opacity-70" />
          {/* 内圈脉动光环 */}
          <div className="absolute inset-[-1px] rounded-full bg-yellow-500/20 animate-pulse" />
        </>
      )}
      {isStreaming && (
        /* 黄色呼吸光环 - 模拟数据传输 */
        <div className="absolute inset-[-2px] rounded-full bg-yellow-500 animate-pulse blur-sm opacity-50" />
      )}
      {isError && (
        /* 红色呼吸光环 - 错误状态 */
        <div className="absolute inset-[-2px] rounded-full bg-red-500 animate-pulse blur-sm opacity-60" />
      )}
      
      {/* 遮罩层 (防止光环溢出到头像内部) */}
      <div className="absolute inset-[1px] rounded-full bg-background z-0" />

      {/* 核心头像 */}
      <div className="relative z-10 w-full h-full">
        <Avatar className="w-full h-full">
          <AvatarImage src={src} alt="AI" className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary">
            {fallback || <Bot className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
};
