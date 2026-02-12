/**
 * PlanReviewCard - HITL (Human-in-the-Loop) 计划审核组件
 * 
 * v3.2 简化设计：
 * - 柔和的边框样式，不抢眼
 * - 简洁的任务列表展示
 * - 保持 Bauhaus 风格但不过度
 * 
 * 状态驱动 UI：基于 isWaitingForApproval
 */

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Edit3, CheckCircle2, XCircle, Play, Loader2, AlertTriangle } from 'lucide-react'
import type { ResumeChatParams } from '@/services/chat'

// 使用 TaskStore
import {
  useIsWaitingForApproval,
  usePendingPlan,
  useTaskActions,
} from '@/hooks/useTaskSelectors'
import { useAddMessageAction } from '@/hooks/useChatSelectors'
import { cn } from '@/lib/utils'

// 专家颜色编码 - 简化版
const EXPERT_COLORS: Record<string, string> = {
  search: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300',
  coder: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300',
  researcher: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300',
  analyzer: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300',
  writer: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300',
  planner: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300',
  image_analyzer: 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-900/30 dark:text-pink-300',
  memorize_expert: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
  generic: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
}

const getExpertColor = (expertType: string) => {
  return EXPERT_COLORS[expertType] || EXPERT_COLORS.generic
}

interface PlanReviewCardProps {
  conversationId: string
  /** 恢复执行函数（复用主聊天的 SSE 处理逻辑） */
  resumeExecution: (params: ResumeChatParams) => Promise<string>
}

export function PlanReviewCard({ 
  conversationId,
  resumeExecution,
}: PlanReviewCardProps) {
  // 使用 TaskStore
  const isWaitingForApproval = useIsWaitingForApproval()
  const pendingPlan = usePendingPlan()
  const { 
    clearPendingPlan,
    setIsWaitingForApproval,
    updateTasksFromPlan,
    setMode,
  } = useTaskActions()
  
  const addMessage = useAddMessageAction()
  
  // 本地编辑状态
  const [editedPlan, setEditedPlan] = useState(pendingPlan)
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // 状态驱动 UI
  if (!isWaitingForApproval) {
    return null
  }

  // Update task description
  const handleUpdateDescription = useCallback((taskId: string, newDescription: string) => {
    setEditedPlan(prev => 
      prev.map(task => 
        task.id === taskId ? { ...task, description: newDescription } : task
      )
    )
  }, [])

  // Delete task
  const handleDeleteTask = useCallback((taskId: string) => {
    setEditedPlan(prev => prev.filter(task => task.id !== taskId))
  }, [])

  // Reject plan - show confirmation dialog
  const handleReject = useCallback(() => {
    setShowConfirmDialog(true)
  }, [])
  
  // Execute cancel operation
  const doCancel = useCallback(async () => {
    setShowConfirmDialog(false)
    setIsCancelling(true)
    
    setIsSubmitting(true)
    
    // 重置 TaskStore 状态
    clearPendingPlan()
    setIsWaitingForApproval(false)
    setMode('simple')
    
    try {
      await resumeExecution({
        threadId: conversationId,
        approved: false
      })
      
      addMessage({
        role: 'system',
        content: '计划已取消，状态已清理',
        timestamp: Date.now()
      })
    } catch (error) {
      // 恢复 plan 状态
      setIsWaitingForApproval(true)
      alert('取消失败，请重试')
    } finally {
      setIsSubmitting(false)
      setIsCancelling(false)
    }
  }, [conversationId, resumeExecution, clearPendingPlan, setIsWaitingForApproval, setMode, addMessage])

  // Confirm and execute plan
  const handleApprove = useCallback(async () => {
    if (editedPlan.length === 0) {
      alert('至少需要保留一个任务')
      return
    }

    const tempMessageId = `temp-resume-${Date.now()}`
    setIsSubmitting(true)
    
    // 🔥 关键修复：设置模式为 complex，让 ComplexModePanel 渲染
    setMode('complex')
    
    // 更新 TaskStore 中的 plan（初始化 tasks Map）
    updateTasksFromPlan(editedPlan)
    // 切换到执行状态
    setIsWaitingForApproval(false)
    
    addMessage({
      id: tempMessageId,
      role: 'system',
      content: '计划已确认，正在恢复执行...',
      timestamp: Date.now()
    })
    
    try {
      const resumeParams: ResumeChatParams = {
        threadId: conversationId,
        updatedPlan: editedPlan.map((task, index) => ({
          id: task.id,
          expert_type: task.expert_type,
          description: task.description,
          sort_order: index,
          status: task.status,
          depends_on: task.depends_on || []
        })),
        approved: true
      }

      await resumeExecution(resumeParams)
    } catch (error) {
      // 恢复状态
      setIsWaitingForApproval(true)
      
      addMessage({
        id: tempMessageId,
        role: 'system',
        content: '启动失败，请检查网络后重试',
        timestamp: Date.now()
      })
      
      alert('恢复执行失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }, [editedPlan, conversationId, resumeExecution, updateTasksFromPlan, setIsWaitingForApproval, addMessage])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "my-3 border-2 border-amber-400 dark:border-amber-600",
          "bg-amber-50 dark:bg-amber-950/30",
          "rounded-lg overflow-hidden"
        )}
      >
        {/* 标题区 - 简洁 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              计划审核
            </h3>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {editedPlan.length} 个任务
            </span>
          </div>
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded">
            HITL
          </span>
        </div>

        {/* 任务列表 - 简洁 */}
        <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {editedPlan.map((task, index) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10, scale: 0.95 }}
                transition={{ delay: index * 0.03 }}
                className={cn(
                  "p-2.5 border border-gray-200 dark:border-gray-700",
                  "bg-white dark:bg-gray-800 rounded-md",
                  "hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                )}
              >
                <div className="flex items-start gap-2">
                  {/* 序号 */}
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono w-5 flex-shrink-0">
                    {index + 1}.
                  </span>
                  
                  <div className="flex-1 min-w-0">
                    {/* 专家类型标签 */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "px-1.5 py-0.5 text-xs font-medium rounded border",
                        getExpertColor(task.expert_type)
                      )}>
                        {task.expert_type}
                      </span>
                    </div>
                    
                    {/* 任务描述 */}
                    {isEditing ? (
                      <textarea
                        value={task.description}
                        onChange={(e) => handleUpdateDescription(task.id, e.target.value)}
                        className={cn(
                          "w-full p-2 text-sm",
                          "border border-gray-300 dark:border-gray-600 rounded",
                          "bg-white dark:bg-gray-700 dark:text-white",
                          "focus:outline-none focus:ring-1 focus:ring-amber-400",
                          "resize-none min-h-[50px]"
                        )}
                        rows={2}
                      />
                    ) : (
                      <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                        {task.description}
                      </div>
                    )}
                  </div>
                  
                  {/* 删除按钮 */}
                  {isEditing && editedPlan.length > 1 && (
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="删除任务"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* 操作按钮区 - 简洁 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20">
          <button
            onClick={() => setIsEditing(!isEditing)}
            disabled={isSubmitting}
            className={cn(
              "px-3 py-1.5 text-xs font-medium",
              "border border-gray-300 dark:border-gray-600 rounded",
              "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300",
              "hover:bg-gray-50 dark:hover:bg-gray-700",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors flex items-center gap-1.5"
            )}
          >
            {isEditing ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                完成编辑
              </>
            ) : (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                编辑
              </>
            )}
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={isSubmitting}
              className={cn(
                "px-3 py-1.5 text-xs font-medium",
                "border border-red-300 dark:border-red-700 rounded",
                "bg-white dark:bg-transparent text-red-600 dark:text-red-400",
                "hover:bg-red-50 dark:hover:bg-red-900/20",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors flex items-center gap-1.5"
              )}
            >
              <XCircle className="w-3.5 h-3.5" />
              取消
            </button>
            
            <button
              onClick={handleApprove}
              disabled={isSubmitting || editedPlan.length === 0}
              className={cn(
                "px-3 py-1.5 text-xs font-medium",
                "bg-blue-600 text-white rounded",
                "hover:bg-blue-700",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors flex items-center gap-1.5"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  执行中
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  确认执行
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* 确认对话框 - 简洁 */}
        <AnimatePresence>
          {showConfirmDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={(e) => e.target === e.currentTarget && setShowConfirmDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className={cn(
                  "w-full max-w-xs",
                  "border border-gray-200 dark:border-gray-700",
                  "bg-white dark:bg-gray-800 rounded-lg overflow-hidden",
                  "shadow-lg"
                )}
              >
                {/* 对话框头部 */}
                <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <h3 className="text-sm font-medium text-red-700 dark:text-red-300">
                    确认取消
                  </h3>
                </div>
                
                {/* 对话框内容 */}
                <div className="p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    确定要取消执行吗？这会清理所有计划状态。
                  </p>
                </div>
                
                {/* 对话框按钮 */}
                <div className="flex gap-2 p-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setShowConfirmDialog(false)}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-medium",
                      "border border-gray-300 dark:border-gray-600 rounded",
                      "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300",
                      "hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    )}
                  >
                    再想想
                  </button>
                  <button
                    onClick={doCancel}
                    disabled={isCancelling}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-medium",
                      "bg-red-600 text-white rounded",
                      "hover:bg-red-700",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "transition-colors"
                    )}
                  >
                    {isCancelling ? '取消中...' : '确定取消'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}

export default PlanReviewCard
