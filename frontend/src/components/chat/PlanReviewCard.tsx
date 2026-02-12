/**
 * PlanReviewCard - HITL (Human-in-the-Loop) 计划审核组件
 * 
 * Bauhaus 设计风格：
 * - 直角无圆角 (rounded-none)
 * - 粗边框 (border-2)
 * - 硬阴影 (shadow-hard)
 * - 三原色编码 (蓝/黄/红)
 * - 按压效果 (active:translate)
 * 
 * 状态驱动 UI：基于 isWaitingForApproval
 */

import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Edit3, CheckCircle2, XCircle, Play, Loader2, Hand, AlertTriangle } from 'lucide-react'
import type { ResumeChatParams } from '@/services/chat'

// 使用 TaskStore
import {
  useIsWaitingForApproval,
  usePendingPlan,
  useTaskActions,
} from '@/hooks/useTaskSelectors'
import { useAddMessageAction } from '@/hooks/useChatSelectors'
import { cn } from '@/lib/utils'

// 专家颜色编码 - Bauhaus 三原色
const EXPERT_COLORS: Record<string, string> = {
  search: 'bg-blue-600 text-white border-blue-600',
  coder: 'bg-yellow-400 text-black border-black',
  researcher: 'bg-red-600 text-white border-red-600',
  analyzer: 'bg-black text-white border-black',
  writer: 'bg-white text-black border-black dark:bg-gray-800 dark:text-white',
  planner: 'bg-blue-500 text-white border-blue-500',
  image_analyzer: 'bg-purple-600 text-white border-purple-600',
  memorize_expert: 'bg-gray-600 text-white border-gray-600',
  generic: 'bg-gray-200 text-black border-black dark:bg-gray-700 dark:text-white',
}

const getExpertColor = (expertType: string) => {
  return EXPERT_COLORS[expertType] || EXPERT_COLORS.generic
}

interface PlanReviewCardProps {
  conversationId: string
  /** 恢复执行函数（复用主聊天的 SSE 处理逻辑） */
  resumeExecution: (params: ResumeChatParams) => Promise<string>
}

export const PlanReviewCard: React.FC<PlanReviewCardProps> = ({ 
  conversationId,
  resumeExecution,
}) => {
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
    
    // 更新 TaskStore 中的 plan
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
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "my-4 border-2 border-black dark:border-white",
          "bg-yellow-400 dark:bg-yellow-500",
          "shadow-hard",
          "transition-all duration-200"
        )}
      >
        {/* 标题区 - Bauhaus 几何构成 */}
        <div className="flex items-center justify-between p-4 border-b-2 border-black dark:border-white bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            {/* 八边形 STOP 标志 - Bauhaus 几何 */}
            <div className="relative">
              <div className="w-10 h-10 bg-red-600 rotate-45 flex items-center justify-center shadow-hard-sm">
                <Hand className="w-5 h-5 text-white -rotate-45" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold uppercase tracking-wider text-black dark:text-white">
                计划审核
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Commander 已生成执行计划，请审核后确认
              </p>
            </div>
          </div>
          {/* HITL 标签 */}
          <span className="px-3 py-1 border-2 border-black dark:border-white bg-black text-white text-xs font-bold uppercase tracking-wider dark:bg-white dark:text-black">
            HITL
          </span>
        </div>

        {/* 任务列表 */}
        <div className="p-4 space-y-3 bg-white dark:bg-gray-900 max-h-96 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {editedPlan.map((task, index) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "p-3 border-2 border-black dark:border-white",
                  "bg-white dark:bg-gray-800",
                  "shadow-hard-sm",
                  "hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-hard",
                  "transition-all duration-150"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* 序号 - Bauhaus 几何方块 */}
                  <div className={cn(
                    "w-8 h-8 flex-shrink-0 flex items-center justify-center",
                    "border-2 border-black dark:border-white",
                    "font-bold text-sm",
                    index === 0 
                      ? "bg-blue-600 text-white border-blue-600" 
                      : "bg-white text-black dark:bg-gray-800 dark:text-white"
                  )}>
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* 专家类型标签 - 三原色编码 */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        "px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
                        "border-2",
                        getExpertColor(task.expert_type)
                      )}>
                        {task.expert_type}
                      </span>
                      {task.depends_on && task.depends_on.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ← 依赖: {task.depends_on.join(', ')}
                        </span>
                      )}
                    </div>
                    
                    {/* 任务描述 */}
                    {isEditing ? (
                      <textarea
                        value={task.description}
                        onChange={(e) => handleUpdateDescription(task.id, e.target.value)}
                        className={cn(
                          "w-full p-2 text-sm",
                          "border-2 border-black dark:border-white",
                          "bg-white dark:bg-gray-700 dark:text-white",
                          "focus:outline-none focus:ring-2 focus:ring-yellow-400",
                          "resize-y min-h-[60px]"
                        )}
                        rows={2}
                      />
                    ) : (
                      <div className="text-sm text-black dark:text-white">
                        {task.description}
                      </div>
                    )}
                  </div>
                  
                  {/* 删除按钮 */}
                  {isEditing && editedPlan.length > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDeleteTask(task.id)}
                      className={cn(
                        "flex-shrink-0 p-2",
                        "border-2 border-red-600 bg-red-600 text-white",
                        "shadow-hard-sm",
                        "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
                        "transition-all duration-100"
                      )}
                      title="删除任务"
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* 操作按钮区 */}
        <div className="flex items-center justify-between p-4 border-t-2 border-black dark:border-white bg-white dark:bg-gray-900">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsEditing(!isEditing)}
            disabled={isSubmitting}
            className={cn(
              "px-4 py-2 text-sm font-bold uppercase tracking-wider",
              "border-2 border-black dark:border-white",
              "bg-white text-black dark:bg-gray-800 dark:text-white",
              "shadow-hard-sm",
              "hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard",
              "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-all duration-100",
              "flex items-center gap-2"
            )}
          >
            {isEditing ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                完成编辑
              </>
            ) : (
              <>
                <Edit3 className="w-4 h-4" />
                编辑计划
              </>
            )}
          </motion.button>

          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleReject}
              disabled={isSubmitting}
              className={cn(
                "px-4 py-2 text-sm font-bold uppercase tracking-wider",
                "border-2 border-red-600",
                "bg-white text-red-600 dark:bg-transparent dark:text-red-500 dark:border-red-500",
                "shadow-hard-sm",
                "hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard",
                "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-all duration-100",
                "flex items-center gap-2"
              )}
            >
              <XCircle className="w-4 h-4" />
              取消
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleApprove}
              disabled={isSubmitting || editedPlan.length === 0}
              className={cn(
                "px-4 py-2 text-sm font-bold uppercase tracking-wider",
                "border-2 border-blue-600",
                "bg-blue-600 text-white",
                "shadow-hard-sm",
                "hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard",
                "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-all duration-100",
                "flex items-center gap-2"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  执行中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  确认执行 ({editedPlan.length})
                </>
              )}
            </motion.button>
          </div>
        </div>
        
        {/* 确认对话框 - Bauhaus 风格 */}
        <AnimatePresence>
          {showConfirmDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
              onClick={(e) => e.target === e.currentTarget && setShowConfirmDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className={cn(
                  "w-full max-w-sm",
                  "border-2 border-black dark:border-white",
                  "bg-white dark:bg-gray-900",
                  "shadow-hard-lg"
                )}
              >
                {/* 对话框头部 */}
                <div className="flex items-center gap-3 p-4 border-b-2 border-black dark:border-white bg-red-600">
                  <AlertTriangle className="w-6 h-6 text-white" />
                  <h3 className="text-lg font-bold uppercase tracking-wider text-white">
                    确认取消
                  </h3>
                </div>
                
                {/* 对话框内容 */}
                <div className="p-4">
                  <p className="text-sm text-black dark:text-white">
                    确定要取消执行吗？这会清理所有计划状态。
                  </p>
                </div>
                
                {/* 对话框按钮 */}
                <div className="flex gap-2 p-4 border-t-2 border-black dark:border-white">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowConfirmDialog(false)}
                    className={cn(
                      "flex-1 px-4 py-2 text-sm font-bold uppercase tracking-wider",
                      "border-2 border-black dark:border-white",
                      "bg-white text-black dark:bg-gray-800 dark:text-white",
                      "shadow-hard-sm",
                      "hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard",
                      "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
                      "transition-all duration-100"
                    )}
                  >
                    再想想
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={doCancel}
                    disabled={isCancelling}
                    className={cn(
                      "flex-1 px-4 py-2 text-sm font-bold uppercase tracking-wider",
                      "border-2 border-red-600",
                      "bg-red-600 text-white",
                      "shadow-hard-sm",
                      "hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard",
                      "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "transition-all duration-100"
                    )}
                  >
                    {isCancelling ? '取消中...' : '确定取消'}
                  </motion.button>
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
