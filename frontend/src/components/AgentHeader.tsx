import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, User, Sparkles, ChevronDown, History, Settings, Edit3, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n';
import type { CustomAgent } from '@/types';

interface AgentHeaderProps {
  // 基础信息
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  avatar?: string;

  // 智能体信息（可选）
  agent?: CustomAgent;

  // 模式相关
  mode?: 'simple' | 'complex';
  onModeChange?: (mode: 'simple' | 'complex') => void;
  allowModeSwitch?: boolean;

  // 操作
  onBack?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onHistory?: () => void;
  onSettings?: () => void;

  // 样式
  className?: string;
  showBorder?: boolean;
}

export function AgentHeader({
  title,
  subtitle,
  icon,
  avatar,
  agent,
  mode = 'simple',
  onModeChange,
  allowModeSwitch = false,
  onBack,
  onEdit,
  onDelete,
  onHistory,
  onSettings,
  className,
  showBorder = true
}: AgentHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showActions, setShowActions] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };

  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-3 bg-[var(--bg-page)]',
      showBorder && 'border-b-2 border-[var(--border-color)]',
      className
    )}>
      {/* 左侧：返回 + 信息 */}
      <div className="flex items-center gap-3 min-w-0">
        {/* 返回按钮 - Bauhaus 风格 */}
        <button
          onClick={handleBack}
          className={cn(
            'flex-shrink-0 w-9 h-9 flex items-center justify-center',
            'border-2 border-[var(--border-color)] bg-[var(--bg-card)]',
            'hover:bg-[var(--accent-hover)] hover:text-black hover:border-black',
            'shadow-[var(--shadow-color)_2px_2px_0_0]',
            'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0]',
            'active:translate-x-0 active:translate-y-0 active:shadow-[var(--shadow-color)_2px_2px_0_0]',
            'transition-all'
          )}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* 头像 - Bauhaus 方形 */}
        <div className={cn(
          'flex-shrink-0 w-9 h-9 flex items-center justify-center border-2',
          avatar ? 'bg-[var(--bg-card)]' : 'bg-[var(--text-primary)] text-[var(--bg-card)]',
          'border-[var(--border-color)]'
        )}>
          {avatar ? (
            <img src={avatar} alt={title} className="w-full h-full object-cover" />
          ) : icon ? (
            icon
          ) : (
            <Bot className="w-4 h-4" />
          )}
        </div>

        {/* 标题信息 */}
        <div className="min-w-0">
          <h1 className="font-mono text-sm font-bold text-[var(--text-primary)] truncate uppercase">
            {title}
          </h1>
          {subtitle && (
            <p className="font-mono text-[10px] text-[var(--text-secondary)] truncate uppercase">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* 右侧：模式切换 + 操作 */}
      <div className="flex items-center gap-2">
        {/* 模式切换 - Bauhaus 风格 */}
        {allowModeSwitch && onModeChange && (
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={() => onModeChange('simple')}
              className={cn(
                'px-2 py-1.5 border-2 font-mono text-[10px] font-bold uppercase transition-all',
                mode === 'simple'
                  ? 'bg-green-500 text-white border-green-600 shadow-[green_2px_2px_0_0]'
                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-primary)]'
              )}
            >
              SIMPLE
            </button>
            <button
              onClick={() => onModeChange('complex')}
              className={cn(
                'px-2 py-1.5 border-2 font-mono text-[10px] font-bold uppercase transition-all',
                mode === 'complex'
                  ? 'bg-[var(--accent-hover)] text-black border-black shadow-[black_2px_2px_0_0]'
                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-primary)]'
              )}
            >
              COMPLEX
            </button>
          </div>
        )}

        {/* 操作菜单 */}
        {(onEdit || onDelete || onHistory || onSettings) && (
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className={cn(
                'w-9 h-9 flex items-center justify-center',
                'border-2 border-[var(--border-color)] bg-[var(--bg-card)]',
                'hover:bg-[var(--accent-hover)] hover:text-black hover:border-black',
                'transition-all',
                showActions && 'bg-[var(--accent-hover)] text-black border-black'
              )}
            >
              {showActions ? <X className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {/* 下拉菜单 - Bauhaus 风格 */}
            {showActions && (
              <>
                {/* 遮罩点击关闭 */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowActions(false)}
                />
                
                <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-card)] border-2 border-[var(--border-color)] shadow-[var(--shadow-color)_4px_4px_0_0] z-50 py-1">
                  {onHistory && (
                    <button
                      onClick={() => {
                        onHistory();
                        setShowActions(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 font-mono text-xs uppercase hover:bg-[var(--accent-hover)] hover:text-black transition-colors"
                    >
                      <History className="w-3 h-3" />
                      {t('history')}
                    </button>
                  )}
                  
                  {onSettings && (
                    <button
                      onClick={() => {
                        onSettings();
                        setShowActions(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 font-mono text-xs uppercase hover:bg-[var(--accent-hover)] hover:text-black transition-colors"
                    >
                      <Settings className="w-3 h-3" />
                      {t('settings')}
                    </button>
                  )}

                  {onEdit && (
                    <button
                      onClick={() => {
                        onEdit();
                        setShowActions(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 font-mono text-xs uppercase hover:bg-[var(--accent-hover)] hover:text-black transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                      {t('edit')}
                    </button>
                  )}

                  {onDelete && (
                    <>
                      <div className="my-1 border-t border-[var(--border-color)]" />
                      <button
                        onClick={() => {
                          onDelete();
                          setShowActions(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 font-mono text-xs uppercase text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('delete')}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
