/**
 * PlanReviewCard - HITL (Human-in-the-Loop) 计划审核组件
 * 
 * 当 Commander 完成规划后，展示此卡片让用户审核、修改计划，
 * 确认后再继续执行。
 * 
 * v3.5 HITL 核心组件
 */

import React, { useState, useCallback } from 'react'
import { useTaskStore, type Task } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
import type { ResumeChatParams } from '@/services/chat'

interface PlanReviewCardProps {
  conversationId: string
  /** 🔥🔥🔥 v3.5 HITL: 恢复执行函数（复用主聊天的 SSE 处理逻辑） */
  resumeExecution: (params: ResumeChatParams) => Promise<string>
}

export const PlanReviewCard: React.FC<PlanReviewCardProps> = ({ 
  conversationId,
  resumeExecution 
}) => {
  const { 
    isWaitingForApproval, 
    pendingPlan, 
    clearPendingPlan,
    setIsWaitingForApproval,
    setPendingPlan,  // 🚨 风险 1 修复：用于失败回滚
    updateTasksFromPlan  // 🔥🔥🔥 新增：同步更新任务列表
  } = useTaskStore()
  
  const { addMessage } = useChatStore()
  const rebuildThinkingFromPlan = useChatStore(state => state.rebuildThinkingFromPlan)  // 🔥🔥🔥 用于同步 thinking
  
  // 本地编辑状态
  const [editedPlan, setEditedPlan] = useState<Task[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // 🔥🔥🔥 自定义确认弹窗状态
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

  // 拒绝计划 - 显示自定义确认弹窗
  const handleReject = useCallback(() => {
    setShowConfirmDialog(true)
  }, [])
  
  // 执行取消操作
  const doCancel = useCallback(async () => {
    setShowConfirmDialog(false)
    setIsCancelling(true)
    
    // 🚨 备份状态
    const previousPlan = [...editedPlan]
    
    setIsSubmitting(true)
    
    // 乐观更新：立即隐藏
    clearPendingPlan()
    setIsWaitingForApproval(false)
    
    console.log('[HITL] 发送取消请求，threadId:', conversationId)
    
    try {
      // 🔥 调用 resumeExecution 发送 approved: false
      await resumeExecution({
        threadId: conversationId,
        approved: false
      })
      
      console.log('[HITL] 计划已取消')
      
      // 添加系统消息提示用户
      addMessage({
        role: 'system',
        content: '❌ 计划已取消，状态已清理',
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('[HITL] 取消失败:', error)
      
      // 🚨 失败回滚
      setPendingPlan(previousPlan)
      setIsWaitingForApproval(true)
      
      // 显示错误提示
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

    // 🚨🚨🚨 风险 1 修复：备份当前状态，用于失败回滚
    const previousPlan = [...editedPlan]
    const tempMessageId = `temp-resume-${Date.now()}`
    
    setIsSubmitting(true)
    
    // 🔥🔥🔥 关键：在隐藏卡片前，先同步更新前端状态
    // 这样 thinking 面板的分母会立即更新（如从 4/5 变成 3/4）
    const taskIds = editedPlan.map(t => t.id)
    console.log('[HITL] 更新任务列表:', { 
      before: useTaskStore.getState().tasks.size, 
      after: editedPlan.length,
      taskIds 
    })
    
    updateTasksFromPlan(editedPlan.map(task => ({
      id: task.id,
      expert_type: task.expert_type,
      description: task.description,
      sort_order: task.sort_order,
      status: task.status
    })))
    
    // 🔥🔥🔥 同步更新 thinking 步骤，移除已删除的任务
    console.log('[HITL] 重建 thinking 步骤:', taskIds)
    rebuildThinkingFromPlan(taskIds)
    
    // 🔥🔥🔥 乐观更新：立即隐藏交互窗口
    clearPendingPlan()
    setIsWaitingForApproval(false)
    
    // 🚨🚨🚨 风险 3 修复：插入临时系统消息（带唯一 ID，方便后续更新/删除）
    addMessage({
      id: tempMessageId,
      role: 'system',
      content: '🔄 计划已确认，正在恢复执行...',
      timestamp: Date.now()
    })
    
    try {
      // 准备 resume 请求参数
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

      console.log('[HITL] 发送 resume 请求:', { 
        threadId: conversationId, 
        taskCount: editedPlan.length 
      })

      // 🔥🔥🔥 关键：调用 resumeExecution
      await resumeExecution(resumeParams)

      console.log('[HITL] Resume 执行完成')
      
      // 更新临时消息为成功状态（可选）
      // 注意：真正的执行结果会通过 SSE 事件更新 UI

    } catch (error) {
      console.error('[HITL] Resume 失败:', error)
      
      // 🚨🚨🚨 风险 1 修复：请求失败，回滚状态！让卡片重新弹出来
      setPendingPlan(previousPlan)
      setIsWaitingForApproval(true)
      
      // 更新临时消息为错误状态
      addMessage({
        id: tempMessageId,  // 覆盖临时消息
        role: 'system',
        content: '❌ 启动失败，请检查网络后重试',
        timestamp: Date.now()
      })
      
      alert('恢复执行失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }, [editedPlan, conversationId, resumeExecution, clearPendingPlan, setIsWaitingForApproval, addMessage, setPendingPlan, pendingPlan.length, updateTasksFromPlan, rebuildThinkingFromPlan])

  return (
    <div className="my-4 p-4 border-2 border-amber-400 rounded-lg bg-amber-50 dark:bg-amber-900/20">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛑</span>
          <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400">
            计划审核
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
      
      {/* 🔥🔥🔥 v3.5 HITL: 破坏性测试指引 */}
      <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-600 dark:text-blue-400">
        <div className="font-semibold mb-1">🧪 破坏性测试指引：</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>修改测试：删除几个任务或修改描述，验证 Worker 是否执行修改后的计划</li>
          <li>拒绝测试：点击取消，验证后端是否正确清理状态（检查 console 日志）</li>
        </ul>
      </div>

      {/* 任务列表 */}
      <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
        {editedPlan.map((task, index) => (
          <div 
            key={task.id}
            className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start gap-3">
              {/* 序号 */}
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center 
                             bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 
                             rounded-full text-sm font-medium">
                {index + 1}
              </span>

              {/* 内容区 */}
              <div className="flex-1 min-w-0">
                {/* Expert 类型 */}
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {task.expert_type}
                </div>

                {/* 描述（可编辑） */}
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

              {/* 删除按钮（编辑模式） */}
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
      
      {/* 🔥🔥🔥 自定义确认弹窗 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              ⚠️ 确认取消
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
