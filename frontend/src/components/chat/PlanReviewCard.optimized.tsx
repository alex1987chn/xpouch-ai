/**
 * PlanReviewCard - HITL (Human-in-the-Loop) 计划审核组件
 * 
 * 🚀 v3.6 性能优化版本
 * - 使用 Zustand Selector 避免不必要的重渲染
 * - 流式输出时组件保持静止
 */

import React, { useState, useCallback } from 'react'
import { type Task } from '@/store/taskStore'
import type { ResumeChatParams } from '@/services/chat'

// 🔥🔥🔥 性能优化：使用 Selector Hooks 替代全量订阅
import {
  useIsWaitingForApproval,
  usePendingPlan,
  useTaskActions,
} from '@/hooks/useTaskSelectors'
import { useAddMessageAction } from '@/hooks/useChatSelectors'
import { useChatStore } from '@/store/chatStore'

interface PlanReviewCardProps {
  conversationId: string
  resumeExecution: (params: ResumeChatParams) => Promise<string>
}

export const PlanReviewCard: React.FC<PlanReviewCardProps> = ({ 
  conversationId,
  resumeExecution 
}) => {
  // ✅ 性能优化：使用 Selector 只订阅需要的值
  const isWaitingForApproval = useIsWaitingForApproval()
  const pendingPlan = usePendingPlan()
  
  // ✅ 性能优化：Actions 使用稳定的引用
  const { 
    clearPendingPlan,
    setIsWaitingForApproval,
    setPendingPlan,
    updateTasksFromPlan 
  } = useTaskActions()
  
  const addMessage = useAddMessageAction()
  
  // 注意：rebuildThinkingFromPlan 不在 useChatSelectors 中，暂时保持原样
  // 或将其添加到 useChatSelectors
  const rebuildThinkingFromPlan = useChatStore(state => state.rebuildThinkingFromPlan)
  
  // 本地编辑状态
  const [editedPlan, setEditedPlan] = useState<Task[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // 初始化编辑状态
  React.useEffect(() => {
    if (pendingPlan.length > 0 && editedPlan.length === 0) {
      setEditedPlan([...pendingPlan])
    }
  }, [pendingPlan, editedPlan.length])

  // 如果不是等待审核状态，不渲染
  if (!isWaitingForApproval) {
    return null
  }

  // 更新任务描述
  const handleUpdateDescription = useCallback((taskId: string, newDescription: string) => {
    setEditedPlan(prev => 
      prev.map(task => 
        task.id === taskId ? { ...task, description: newDescription } : task
      )
    )
  }, [])

  // 删除任务
  const handleDeleteTask = useCallback((taskId: string) => {
    setEditedPlan(prev => prev.filter(task => task.id !== taskId))
  }, [])

  // 拒绝计划
  const handleReject = useCallback(() => {
    setShowConfirmDialog(true)
  }, [])
  
  // 执行取消操作
  const doCancel = useCallback(async () => {
    setShowConfirmDialog(false)
    setIsCancelling(true)
    const previousPlan = [...editedPlan]
    setIsSubmitting(true)
    
    clearPendingPlan()
    setIsWaitingForApproval(false)
    
    try {
      await resumeExecution({
        threadId: conversationId,
        approved: false
      })
      
      addMessage({
        role: 'system',
        content: '❌ 计划已取消，状态已清理',
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('[HITL] 取消失败:', error)
      setPendingPlan(previousPlan)
      setIsWaitingForApproval(true)
      alert('取消失败，请重试')
    } finally {
      setIsSubmitting(false)
      setIsCancelling(false)
    }
  }, [conversationId, resumeExecution, clearPendingPlan, addMessage, setPendingPlan, setIsWaitingForApproval, editedPlan])

  // 确认并执行计划
  const handleApprove = useCallback(async () => {
    if (editedPlan.length === 0) {
      alert('至少需要保留一个任务')
      return
    }

    const previousPlan = [...editedPlan]
    const tempMessageId = `temp-resume-${Date.now()}`
    setIsSubmitting(true)
    
    const taskIds = editedPlan.map(t => t.id)
    
    updateTasksFromPlan(editedPlan.map(task => ({
      id: task.id,
      expert_type: task.expert_type,
      description: task.description,
      sort_order: task.sort_order,
      status: task.status
    })))
    
    rebuildThinkingFromPlan(taskIds)
    
    clearPendingPlan()
    setIsWaitingForApproval(false)
    
    addMessage({
      id: tempMessageId,
      role: 'system',
      content: '🔄 计划已确认，正在恢复执行...',
      timestamp: Date.now()
    })
    
    try {
      const resumeParams: ResumeChatParams = {
        threadId: conversationId,
        updatedPlan: editedPlan.map(task => ({
          id: task.id,
          expert_type: task.expert_type,
          description: task.description,
          sort_order: task.sort_order,
          status: task.status
        })),
        approved: true
      }

      await resumeExecution(resumeParams)
    } catch (error) {
      console.error('[HITL] Resume 失败:', error)
      setPendingPlan(previousPlan)
      setIsWaitingForApproval(true)
      
      addMessage({
        id: tempMessageId,
        role: 'system',
        content: '❌ 启动失败，请检查网络后重试',
        timestamp: Date.now()
      })
      
      alert('恢复执行失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }, [editedPlan, conversationId, resumeExecution, clearPendingPlan, setIsWaitingForApproval, addMessage, setPendingPlan, updateTasksFromPlan, rebuildThinkingFromPlan])

  return (
    <div className="my-4 p-4 border-2 border-amber-400 rounded-lg bg-amber-50 dark:bg-amber-900/20">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛑</span>
          <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400">
            计划审核 (优化版)
          </h3>
        </div>
        <span className="text-xs px-2 py-1 bg-amber-200 dark:bg-amber-800 rounded">
          HITL
        </span>
      </div>

      {/* 说明文字 */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Commander 已生成执行计划，请审核或修改后再执行：
      </p>
      
      {/* 性能优化提示 */}
      <div className="mb-4 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-600 dark:text-green-400">
        <div className="font-semibold mb-1">🚀 性能优化：</div>
        <p>此组件使用 Zustand Selector 优化，流式输出时不会重渲染</p>
      </div>

      {/* 任务列表 */}
      <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
        {editedPlan.map((task, index) => (
          <div 
            key={task.id}
            className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center 
                             bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 
                             rounded-full text-sm font-medium">
                {index + 1}
              </span>

              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {task.expert_type}
                </div>

                {isEditing ? (
                  <textarea
                    value={task.description}
                    onChange={(e) => handleUpdateDescription(task.id, e.target.value)}
                    className="w-full p-2 text-sm border rounded resize-y min-h-[60px]
                             dark:bg-gray-700 dark:border-gray-600"
                    rows={2}
                  />
                ) : (
                  <div className="text-sm text-gray-800 dark:text-gray-200">
                    {task.description}
                  </div>
                )}
              </div>

              {isEditing && editedPlan.length > 1 && (
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="flex-shrink-0 p-1 text-red-500 hover:bg-red-50 rounded"
                  title="删除任务"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-3 border-t border-amber-200 dark:border-amber-800">
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 
                     rounded hover:bg-gray-100 dark:hover:bg-gray-700
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEditing ? '完成编辑' : '✏️ 编辑'}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-sm border border-red-300 dark:border-red-700
                     text-red-600 dark:text-red-400 rounded
                     hover:bg-red-50 dark:hover:bg-red-900/30
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleApprove}
            disabled={isSubmitting || editedPlan.length === 0}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⏳</span>
                执行中...
              </>
            ) : (
              <>
                ▶️ 确认并执行 ({editedPlan.length})
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* 确认弹窗 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">⚠️ 确认取消</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              确定要取消执行吗？这会清理所有计划状态。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
              >
                再想想
              </button>
              <button
                onClick={doCancel}
                disabled={isCancelling}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                {isCancelling ? '取消中...' : '确定取消'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PlanReviewCard
