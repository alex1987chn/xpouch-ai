/**
 * PlanReviewCard - HITL (Human-in-the-Loop) 计划审核组件
 * 
 * 当 Commander 完成规划后，展示此卡片让用户审核、修改计划，
 * 确认后再继续执行。
 * 
 * v3.2.0 Phase 2: Server-Driven UI 重构
 * - 直接使用 ExecutionStore，不再通过 Props 接收 plan
 * - 状态驱动 UI：基于 executionStore.status === 'reviewing'
 */

import React, { useState, useCallback } from 'react'
import { Trash2, Edit3, CheckCircle2, XCircle, Play, Loader2 } from 'lucide-react'
import type { ResumeChatParams } from '@/services/chat'

// Phase 2: Server-Driven UI - 使用 ExecutionStore
import {
  useExecutionStatus,
  useExecutionPlan,
  useExecutionActions,
} from '@/store/executionStore'
import { useAddMessageAction } from '@/hooks/useChatSelectors'

interface PlanReviewCardProps {
  conversationId: string
  /** v3.1.0 HITL: 恢复执行函数（复用主聊天的 SSE 处理逻辑） */
  resumeExecution: (params: ResumeChatParams) => Promise<string>
}

export const PlanReviewCard: React.FC<PlanReviewCardProps> = ({ 
  conversationId,
  resumeExecution,
}) => {
  // Phase 2: Server-Driven UI - 使用 ExecutionStore
  const executionStatus = useExecutionStatus()
  const executionPlan = useExecutionPlan()
  const { 
    setStatus: setExecutionStatus,
    setPlan: setExecutionPlan,
    reset: resetExecutionStore 
  } = useExecutionActions()
  
  const addMessage = useAddMessageAction()
  
  // 本地编辑状态 - 直接用 executionPlan 初始化
  // 父组件通过 key 属性控制重置时机
  const [editedPlan, setEditedPlan] = useState(executionPlan)
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // Phase 2: Server-Driven UI - 基于 executionStatus 判断显示
  if (executionStatus !== 'reviewing') {
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
    
    const previousPlan = [...editedPlan]
    setIsSubmitting(true)
    
    // Phase 2: 使用 ExecutionStore 重置状态
    resetExecutionStore()
    
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
      setExecutionPlan(previousPlan)
      setExecutionStatus('reviewing')
      alert('取消失败，请重试')
    } finally {
      setIsSubmitting(false)
      setIsCancelling(false)
    }
  }, [conversationId, resumeExecution, resetExecutionStore, addMessage, setExecutionPlan, setExecutionStatus, editedPlan])

  // Confirm and execute plan
  const handleApprove = useCallback(async () => {
    if (editedPlan.length === 0) {
      alert('至少需要保留一个任务')
      return
    }

    const previousPlan = [...editedPlan]
    const tempMessageId = `temp-resume-${Date.now()}`
    setIsSubmitting(true)
    
    // Phase 2: 更新 ExecutionStore 中的 plan
    setExecutionPlan(editedPlan)
    // 切换到执行状态
    setExecutionStatus('executing')
    
    addMessage({
      id: tempMessageId,
      role: 'system',
      content: '计划已确认，正在恢复执行...',
      timestamp: Date.now()
    })
    
    try {
      const resumeParams: ResumeChatParams = {
        threadId: conversationId,
        updatedPlan: editedPlan.map(task => ({
          id: task.id,
          expert_type: task.expertType,
          description: task.description,
          sort_order: 0, // ExecutionStore 的 Task 不存储 sort_order
          status: task.status,
          depends_on: task.dependencies || [] // 🔥 关键修复：传递依赖关系到后端
        })),
        approved: true
      }

      await resumeExecution(resumeParams)
    } catch (error) {
      // 恢复状态
      setExecutionPlan(previousPlan)
      setExecutionStatus('reviewing')
      
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
  }, [editedPlan, conversationId, resumeExecution, setExecutionPlan, setExecutionStatus, addMessage])

  return (
    <div className="my-4 p-4 border-2 border-amber-400 rounded-lg bg-amber-50 dark:bg-amber-900/20">
      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">STOP</span>
          </div>
          <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400">
            计划审核
          </h3>
        </div>
        <span className="text-xs px-2 py-1 bg-amber-200 dark:bg-amber-800 rounded font-mono">
          HITL
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Commander 已生成执行计划，请审核或修改后再执行：
      </p>
      
      {/* v3.1.0 HITL: Test guide */}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
        <div className="font-semibold mb-1 flex items-center gap-1">
          <span>测试指引:</span>
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-blue-500 dark:text-blue-300">
          <li>修改测试: 删除任务或编辑描述，验证 Worker 执行修改后的计划</li>
          <li>取消测试: 点击取消，验证后端正确清理状态</li>
        </ul>
      </div>

      {/* Task list */}
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
                  {task.expertType}
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
                  className="flex-shrink-0 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                  title="删除任务"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-amber-200 dark:border-amber-800">
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 
                     rounded hover:bg-gray-100 dark:hover:bg-gray-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-1.5 transition-colors"
          >
            {isEditing ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                完成编辑
              </>
            ) : (
              <>
                <Edit3 className="w-4 h-4" />
                编辑
              </>
            )}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-sm border border-red-300 dark:border-red-700
                     text-red-600 dark:text-red-400 rounded
                     hover:bg-red-50 dark:hover:bg-red-900/30
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-1.5 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            取消
          </button>
          <button
            onClick={handleApprove}
            disabled={isSubmitting || editedPlan.length === 0}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-2 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                执行中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                确认并执行 ({editedPlan.length})
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Confirmation dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              确认取消
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              确定要取消执行吗？这会清理所有计划状态。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded
                         text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700
                         transition-colors"
              >
                再想想
              </button>
              <button
                onClick={doCancel}
                disabled={isCancelling}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded
                         hover:bg-red-700 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
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
